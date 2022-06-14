body = context.getMessageBodyAsString();
temp = JSON.parse(context.getData());
prefix = temp["prefix"];
data = JSON.parse(body);

data.forEach(function (item) {
    response = item["response"];
    periods = response["periods"];
    periods.forEach(function (period) {
        projectName = context.getProperty(period["contract_id"]);
        if (period["on_budget"] == 0) { bud = 1 } else { bud = 0 }
        context.sendMetric(context.getTimestamp(), prefix + projectName + "_" + period["id"], period["on_budget"], { "ad": "ad_z", "ad_p": "10m" });
    }
    );
});
