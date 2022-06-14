/*
Set up a URL to call, URLEncoding the query parameters

Expected data structure is:
{
    "data": {
        "path": "/services/search/jobs/export?output_mode=json&search=",
        "query": "search for the meaning of life",
        "host-ref": "splunk"
    }
}

*/
data = JSON.parse(context.getData());
query = encodeURIComponent(data["query"]);
context.setUrl(data["host-ref"], data["path"]+query);