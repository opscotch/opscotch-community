if(context.getHeader("Cookie") == '["JSESSIONID=A; X-CSRF-TOKEN=B; "]') {
    context.sendMetric("cookiecheck", 1);
}

context.sendToStep("send-results2", null);