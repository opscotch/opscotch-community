HOST=127.0.0.1
PORT=13000
DELIMITER="|"
PAIRS_PER_BLOB=100
PAIR_VALUE=1000

alpha_key() {
  local idx=$1
  local key=""
  local rem
  while true; do
    rem=$((idx % 26))
    key="$(printf "\\$(printf '%03o' $((rem + 97)))")${key}"
    idx=$((idx / 26 - 1))
    if ((idx < 0)); then
      break
    fi
  done
  printf "%s" "$key"
}

echo "Fuzzing $HOST:$PORT (Ctrl+C to stop)"

KEY_INDEX=0
while true; do
  BLOB=""
  for ((i = 0; i < PAIRS_PER_BLOB; i++)); do
    KEY="$(alpha_key "$KEY_INDEX")"
    KEY_INDEX=$((KEY_INDEX + 1))
    if [[ -n "$BLOB" ]]; then
      BLOB+="$DELIMITER"
    fi
    BLOB+="${KEY}=${PAIR_VALUE}"
  done

  printf "%s\n" "$BLOB" | nc -N "$HOST" "$PORT" >/dev/null 2>&1

  sleep 2
done