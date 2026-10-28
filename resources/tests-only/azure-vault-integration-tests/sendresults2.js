doc
    .description("Azure vault integration test helper that emits a cookie-check metric when the expected Cookie header is present.")
    .run(() => {
        if (context.getHeader("Cookie") == '["JSESSIONID=A; X-CSRF-TOKEN=B; "]') {
            context.sendMetric("cookiecheck", 2);
        }
    });
