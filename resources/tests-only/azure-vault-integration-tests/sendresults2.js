if(context.getHeader("Cookie") == '["JSESSIONID=A; X-CSRF-TOKEN=B; "]') {
    context.sendMetric("cookiecheck", 2);
}