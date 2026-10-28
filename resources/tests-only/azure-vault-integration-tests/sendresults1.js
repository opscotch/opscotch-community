doc
    .description("Azure vault integration test helper that emits a cookie-check metric and forwards to send-results2.")
    .run(() => {
        if (context.getHeader("Cookie") == '["JSESSIONID=A; X-CSRF-TOKEN=B; "]') {
            context.sendMetric("cookiecheck", 1);
        }

        context.sendToStep("send-results2", null);
    });
