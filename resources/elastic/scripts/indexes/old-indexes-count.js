doc
    .description("Counts Elasticsearch indexes older than days-old and forwards an elastic-indexes-beyond-expiry metric.")
    .dataSchema({
        type: "object",
        required: ["days-old", "processroute"],
        properties: {
            "days-old": { type: ["string", "number"] },
            processroute: { type: "string" }
        }
    })
    .inSchema({
        type: "array",
        items: {
            type: "object",
            properties: {
                index: { type: "string" }
            }
        }
    })
    .run(() => {
        const body = context.getMessageBodyAsString();
        const indexList = JSON.parse(body);

        const temp = JSON.parse(context.getData());
        const daysOld = parseInt(temp["days-old"]);

        let oldIndexes = 0;

        /* Getting the index name and docs number */
        const REX = /[\-]\d{4}[\.](0?[1-9]|1[012])[\.](0?[1-9]|[12][0-9]|3[01])$/; /* i.e match with : index_name-2021.11.17 */
        const REX2 = /[\-]\d{4}[\.](0?[1-9]|1[012])[\.](0?[1-9]|[12][0-9]|3[01])[\-]\d*$/;  /* i.e match with : index_name-2021.11.17-00001 */
        indexList.forEach(obj => {
            const ind = obj["index"];
            let indexDateStr;
            let flag;
            /* considering only the indexes which name end in a date -YYYY.MM.DD-dddddd and ignoring indexes which start with a . */
            if (ind.match(REX2) && ind.charAt(0) != ".") {
                const indArray = ind.split("-");
                indexDateStr = indArray[indArray.length - 2];
                flag = true;
            }
            /* considering only the indexes which name end in a date -YYYY.MM.DD and ignoring indexes which start with a . */
            else if (ind.match(REX) && ind.charAt(0) != ".") {
                // getting the index date
                indexDateStr = ind.slice(ind.length - 10, ind.length);
                flag = true;
            } else { flag = false; }
            // if the index name match with REX or REX2 calculate the age
            if (flag) {
                // calculating the difference between today and the index date
                const today = new Date(context.getTimestamp());
                const indexDate = new Date(indexDateStr);
                const diffDays = Math.floor((today - indexDate) / (24 * 3600 * 1000));
                if (diffDays >= daysOld) {
                    oldIndexes++;
                }
            }
        });

        const metric = { metric: "elastic-indexes-beyond-expiry", "value": oldIndexes };

        context.sendToStep(context.getData("processroute"), JSON.stringify(metric))
    });
