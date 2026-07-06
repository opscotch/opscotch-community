package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"
)

type event struct {
	Type                 string `json:"type"`
	ID                   int64  `json:"id,omitempty"`
	Token                string `json:"token,omitempty"`
	Method               string `json:"method,omitempty"`
	Path                 string `json:"path,omitempty"`
	Query                string `json:"query,omitempty"`
	RemoteAddr           string `json:"remoteAddr,omitempty"`
	DelayMs              int    `json:"delayMs,omitempty"`
	StartedAtUnixNano    int64  `json:"startedAtUnixNano,omitempty"`
	FinishedAtUnixNano   int64  `json:"finishedAtUnixNano,omitempty"`
	DurationMs           int64  `json:"durationMs,omitempty"`
	StatusCode           int    `json:"statusCode,omitempty"`
	ActiveRequests       int    `json:"activeRequests,omitempty"`
	MaxActiveRequests    int    `json:"maxActiveRequests,omitempty"`
	ActiveConnections    int    `json:"activeConnections,omitempty"`
	MaxActiveConnections int    `json:"maxActiveConnections,omitempty"`
	Error                string `json:"error,omitempty"`
}

type snapshot struct {
	TotalRequests        int64 `json:"totalRequests"`
	CompletedRequests    int64 `json:"completedRequests"`
	FailedRequests       int64 `json:"failedRequests"`
	CanceledRequests     int64 `json:"canceledRequests"`
	ActiveRequests       int   `json:"activeRequests"`
	MaxActiveRequests    int   `json:"maxActiveRequests"`
	ActiveConnections    int   `json:"activeConnections"`
	MaxActiveConnections int   `json:"maxActiveConnections"`
	LastUpdatedUnixNano  int64 `json:"lastUpdatedUnixNano"`
}

type serviceState struct {
	mu                   sync.Mutex
	journalPath          string
	snapshotPath         string
	totalRequests        int64
	completedRequests    int64
	failedRequests       int64
	canceledRequests     int64
	activeRequests       int
	maxActiveRequests    int
	activeConnections    int
	maxActiveConnections int
	lastUpdatedUnixNano  int64
	nextID               int64
	openConns            map[net.Conn]struct{}
}

func newServiceState(stateDir string) *serviceState {
	return &serviceState{
		journalPath:  filepath.Join(stateDir, "events.ndjson"),
		snapshotPath: filepath.Join(stateDir, "state.json"),
		openConns:    make(map[net.Conn]struct{}),
	}
}

func (s *serviceState) nextRequestID() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	return s.nextID
}

func (s *serviceState) onRequestStart() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.totalRequests++
	s.activeRequests++
	if s.activeRequests > s.maxActiveRequests {
		s.maxActiveRequests = s.activeRequests
	}
	s.lastUpdatedUnixNano = time.Now().UnixNano()
	return s.activeRequests
}

func (s *serviceState) onRequestEnd(statusCode int) (int, int, int64, int64, int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.activeRequests > 0 {
		s.activeRequests--
	}
	switch {
	case statusCode < 400:
		s.completedRequests++
	case statusCode == 499:
		s.canceledRequests++
	default:
		s.failedRequests++
	}
	s.lastUpdatedUnixNano = time.Now().UnixNano()
	return s.activeRequests, s.maxActiveRequests, s.completedRequests, s.failedRequests, s.canceledRequests
}

func (s *serviceState) onConnState(conn net.Conn, state http.ConnState) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch state {
	case http.StateNew:
		if _, exists := s.openConns[conn]; !exists {
			s.openConns[conn] = struct{}{}
			s.activeConnections++
			if s.activeConnections > s.maxActiveConnections {
				s.maxActiveConnections = s.activeConnections
			}
		}
	case http.StateHijacked, http.StateClosed:
		if _, exists := s.openConns[conn]; exists {
			delete(s.openConns, conn)
			if s.activeConnections > 0 {
				s.activeConnections--
			}
		}
	}

	s.lastUpdatedUnixNano = time.Now().UnixNano()
}

func (s *serviceState) writeSnapshotLocked() error {
	snap := snapshot{
		TotalRequests:        s.totalRequests,
		CompletedRequests:    s.completedRequests,
		FailedRequests:       s.failedRequests,
		CanceledRequests:     s.canceledRequests,
		ActiveRequests:       s.activeRequests,
		MaxActiveRequests:    s.maxActiveRequests,
		ActiveConnections:    s.activeConnections,
		MaxActiveConnections: s.maxActiveConnections,
		LastUpdatedUnixNano:  s.lastUpdatedUnixNano,
	}

	data, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(s.snapshotPath, data, 0o644)
}

func (s *serviceState) appendEventLocked(ev event) error {
	file, err := os.OpenFile(s.journalPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()

	payload, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	if _, err := file.Write(payload); err != nil {
		return err
	}
	if _, err := file.Write([]byte{'\n'}); err != nil {
		return err
	}
	return nil
}

func (s *serviceState) resetLocked() error {
	s.totalRequests = 0
	s.completedRequests = 0
	s.failedRequests = 0
	s.canceledRequests = 0
	s.activeRequests = 0
	s.maxActiveRequests = 0
	s.activeConnections = 0
	s.maxActiveConnections = 0
	s.lastUpdatedUnixNano = time.Now().UnixNano()
	s.nextID = 0
	s.openConns = make(map[net.Conn]struct{})
	if err := os.Remove(s.journalPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := s.writeSnapshotLocked(); err != nil {
		return err
	}
	return nil
}

func (s *serviceState) snapshot() snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return snapshot{
		TotalRequests:        s.totalRequests,
		CompletedRequests:    s.completedRequests,
		FailedRequests:       s.failedRequests,
		CanceledRequests:     s.canceledRequests,
		ActiveRequests:       s.activeRequests,
		MaxActiveRequests:    s.maxActiveRequests,
		ActiveConnections:    s.activeConnections,
		MaxActiveConnections: s.maxActiveConnections,
		LastUpdatedUnixNano:  s.lastUpdatedUnixNano,
	}
}

func parseDelayMs(values map[string][]string, defaultDelay int) int {
	delay := defaultDelay
	if raw := firstQueryValue(values, "delayMs"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 {
			delay = parsed
		}
	}
	return delay
}

func firstQueryValue(values map[string][]string, key string) string {
	items := values[key]
	if len(items) == 0 {
		return ""
	}
	return items[0]
}

func writeJSONResponse(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func main() {
	var (
		port         = flag.Int("port", 0, "listening port")
		stateDir     = flag.String("state-directory", "", "directory for state and journal files")
		defaultDelay = flag.Int("default-delay-ms", 0, "default work delay in milliseconds")
	)
	flag.Parse()

	if *port <= 0 {
		fmt.Fprintln(os.Stderr, "missing or invalid --port")
		os.Exit(2)
	}
	if *stateDir == "" {
		fmt.Fprintln(os.Stderr, "missing or invalid --state-directory")
		os.Exit(2)
	}
	if err := os.MkdirAll(*stateDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "create state directory: %v\n", err)
		os.Exit(1)
	}

	state := newServiceState(*stateDir)
	state.mu.Lock()
	if err := state.writeSnapshotLocked(); err != nil {
		state.mu.Unlock()
		fmt.Fprintf(os.Stderr, "initialize snapshot: %v\n", err)
		os.Exit(1)
	}
	state.mu.Unlock()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSONResponse(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/state", func(w http.ResponseWriter, r *http.Request) {
		writeJSONResponse(w, http.StatusOK, state.snapshot())
	})
	mux.HandleFunc("/reset", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost && r.Method != http.MethodPut {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		state.mu.Lock()
		defer state.mu.Unlock()
		if err := state.resetLocked(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSONResponse(w, http.StatusOK, map[string]string{"status": "reset"})
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/health" || r.URL.Path == "/state" || r.URL.Path == "/reset" {
			http.NotFound(w, r)
			return
		}

		startedAt := time.Now()
		requestID := state.nextRequestID()
		activeAtStart := state.onRequestStart()
		delay := parseDelayMs(r.URL.Query(), *defaultDelay)
		token := r.URL.Query().Get("token")
		statusCode := http.StatusOK
		var responseError string

		defer func() {
			activeRequests, maxActiveRequests, _, _, _ := state.onRequestEnd(statusCode)
			state.mu.Lock()
			_ = state.appendEventLocked(event{
				Type:                 "request",
				ID:                   requestID,
				Token:                token,
				Method:               r.Method,
				Path:                 r.URL.Path,
				Query:                r.URL.RawQuery,
				RemoteAddr:           r.RemoteAddr,
				DelayMs:              delay,
				StartedAtUnixNano:    startedAt.UnixNano(),
				FinishedAtUnixNano:   time.Now().UnixNano(),
				DurationMs:           time.Since(startedAt).Milliseconds(),
				StatusCode:           statusCode,
				ActiveRequests:       activeRequests,
				MaxActiveRequests:    maxActiveRequests,
				ActiveConnections:    state.activeConnections,
				MaxActiveConnections: state.maxActiveConnections,
				Error:                responseError,
			})
			_ = state.writeSnapshotLocked()
			state.mu.Unlock()
		}()

		if delay > 0 {
			timer := time.NewTimer(time.Duration(delay) * time.Millisecond)
			defer timer.Stop()
			select {
			case <-timer.C:
			case <-r.Context().Done():
				statusCode = 499
				responseError = r.Context().Err().Error()
				return
			}
		}

		if r.URL.Query().Get("fail") == "1" {
			statusCode = http.StatusInternalServerError
			responseError = "requested failure"
			http.Error(w, responseError, statusCode)
			return
		}

		writeJSONResponse(w, statusCode, map[string]any{
			"id":            requestID,
			"token":         token,
			"delayMs":       delay,
			"activeAtStart": activeAtStart,
			"durationMs":    time.Since(startedAt).Milliseconds(),
			"status":        "ok",
		})
	})

	server := &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%d", *port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       30 * time.Second,
		ConnState: func(conn net.Conn, connState http.ConnState) {
			state.onConnState(conn, connState)
		},
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe()
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	select {
	case <-ctx.Done():
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintf(os.Stderr, "server error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		fmt.Fprintf(os.Stderr, "shutdown error: %v\n", err)
		os.Exit(1)
	}
	if err := <-errCh; err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintf(os.Stderr, "server close error: %v\n", err)
		os.Exit(1)
	}
}
