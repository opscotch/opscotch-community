doc
    .dataSchema(
        {
            required : [ "hostId" ],
            properties : {
                hostId : {
                    type : "string"
                }
            }
        }
    )
    .run(() => {

        const outputs = {};
        const bytes = context.bytes();
        const crypto = context.crypto();

        const hostId = context.getData("hostId");

        const hostData = JSON.parse(context.getRestrictedDataFromHost(hostId));
        [ "region", "accessKey", "secretKey", "host", "service" ].forEach(p => {
            if (!hostData[p]) {
                throw `${p} expected as a data property on the ${hostId} host`
            }
        });

        const user_inputs = hostData;
        user_inputs.time = new Date(context.getTimestamp());
        
        const contentType = JSON.parse(context.getHeader("Content-Type"))[0]; 

        user_inputs.method = context.getProperty("method");
        user_inputs.uri = context.getProperty("uri");
        user_inputs.query_string = context.getProperty("queryString") ? context.getProperty("queryString").replace("?","") : "";
        user_inputs.algo = "AWS4-HMAC-SHA256";
        user_inputs.timeout = "60";
        user_inputs.payload = context.getBody() ?? "";

        const dateAWS = (jsDate) => jsDate.getFullYear()+('0' + (jsDate.getMonth()+1)).slice(-2)+('0' + jsDate.getDate()).slice(-2);
        const awsDate = (d) => d.toISOString().substring(0,d.toISOString().indexOf(".")).replace(/:/g,"").replace(/-/g,"")+"Z";
        const makeSignedHeaders = (headers) => {
            var output = "";
            var lines = headers.split('\n');
            var h_obj = {};
            
            //Create object
            for (var i = 0; i < lines.length; i++) {
                var pair = lines[i].split(':');
                if(pair[0]){
                    h_obj[pair[0].toLowerCase().trim()]=pair[1];
                }
            }
            
            //Sort keys
            var keysSorted = Object.keys(h_obj).sort();
            
            //Build output querystring
            for (var i = 0; i < keysSorted.length; i++) {
                output += (keysSorted[i]);
                if(i < keysSorted.length-1) output += ";";
            }
            
            return output;
        }
        const makeCanonicalQueryString = (qs) => {
            var queries = qs.split('&');
            var q_obj = {};
            var output = "";
            
            //Create object
            for (var i = 0; i < queries.length; i++) {
                var pair = queries[i].split('=');
                q_obj[pair[0]]=pair[1];
            }
            
            //Sort keys
            var keysSorted = Object.keys(q_obj).sort();
            
            //Build output querystring
            for (var i = 0; i < keysSorted.length; i++) {
                output += encodeURI(keysSorted[i]);
                output += "=" + encodeURI(q_obj[keysSorted[i]]).replace(/;/g,"%3B"); 
                if(i < keysSorted.length-1) output += "&";
            }
            
            return output;
        }
        const makeCanonicalHeaders = (headers) => {
            var output = "";
            var lines = headers.split('\n');
            var h_obj = {};
            
            //Create object
            for (var i = 0; i < lines.length; i++) {
                var pair = lines[i].split(':');
                if(pair[0]){
                    h_obj[pair[0].toLowerCase().trim()]=pair[1];
                }
            }
            
            //Sort keys
            var keysSorted = Object.keys(h_obj).sort();
            
            //Build output querystring
            for (var i = 0; i < keysSorted.length; i++) {
                output += (keysSorted[i]+":");
                if(h_obj[keysSorted[i]]){
                    output += h_obj[keysSorted[i]].trim().replace(/\s+/g," ");
                }
                output += "\n";
            }
            
            return output;
        }
        const bufferSha256Hex = (b) => bytes.binaryToHex(bytes.sha256(b)).toLowerCase();
        const strSha256Hex = (str) => bufferSha256Hex(bytes.createFromString(str));
        const getSignatureKey = (key, dateStamp, regionName, serviceName) => {

            const kSecret = bytes.createFromString("AWS4" + key);
            const kDate = crypto.hmacSha256(kSecret, bytes.createFromString(dateStamp));
            const kRegion = crypto.hmacSha256(kDate, bytes.createFromString(regionName));
            const kService = crypto.hmacSha256(kRegion, bytes.createFromString(serviceName));
            const signingKey = crypto.hmacSha256(kService, bytes.createFromString("aws4_request"));  
            return signingKey;
        }

        //Task 0: Prep data needed in multiple steps
        var shortDate = dateAWS(user_inputs.time);
        outputs.scope = shortDate + "/" + user_inputs.region + "/" + user_inputs.service + "/aws4_request";
        outputs.awsTime = awsDate(user_inputs.time);
        console.log(`amzDate=${outputs.awsTime}`);

        user_inputs.headers = `content-type:${contentType}\nhost:${user_inputs.host.trim().replace(/\s+/g, " ")}\nx-amz-date:${outputs.awsTime}\n`;

        outputs.signedHeaders = makeSignedHeaders(user_inputs.headers);

        var str_concat = "";
        //Task 1: Step 1 - Method
        outputs.methodStr = user_inputs.method;
        str_concat += outputs.methodStr + "\n";

        //Task 1: Step 2 - Encode URI
        if(user_inputs.uri.length > 0){
            outputs.encodedURI = encodeURI(user_inputs.uri);
            
        }else outputs.encodedURI = "/";
        
        str_concat += outputs.encodedURI + "\n";

        //Task 1: Step 3 - Canonical QueryString
        if(user_inputs.query_string != ""){
            outputs.canonicalQueryString = makeCanonicalQueryString(user_inputs.query_string);
        }else outputs.canonicalQueryString = "";
        
        str_concat += outputs.canonicalQueryString + "\n";
        
        //Task 1: Step 4 - Canonical Headers
        outputs.canonicalHeaders = makeCanonicalHeaders(user_inputs.headers);
        str_concat += outputs.canonicalHeaders + "\n";

        //Task 1: Step 5 - Signed Headers  - See Task 0 for how to create the signedHeaders
	    str_concat += outputs.signedHeaders + "\n";

        //Task 1: Step 6 - Hashed Payload
	    outputs.hashedPayload = strSha256Hex(user_inputs.payload);
        console.log(`payloadHash=${outputs.hashedPayload}`)

        //Task 1: Step 7 - Canonical Request
        outputs.canonicalRequest = str_concat + outputs.hashedPayload;
        
        //Task 1: Step 8 - Hashed Canonical Request
        outputs.hashedCanonicalRequest = strSha256Hex(outputs.canonicalRequest);
        console.log(`requestHash=${outputs.hashedCanonicalRequest}`);

        //Reset string_concat
        str_concat = "";
        
        //Task 2: Step 1
        outputs.algo = user_inputs.algo;
        str_concat += outputs.algo + "\n";
        
        //Task 2: Step 2
        str_concat += outputs.awsTime + "\n";
        
        //Task 2: Step 3
        str_concat += outputs.scope + "\n";
        
        //Task 2: Step 4
        outputs.stringToSign = str_concat + outputs.hashedCanonicalRequest;

        console.log(`stringToSign=${outputs.stringToSign}`);
        
        //Task 3: Step 1
        outputs.signingKey = getSignatureKey(user_inputs.secretKey, shortDate, user_inputs.region, user_inputs.service);
        console.log(`signKeyInput=${user_inputs.secretKey} ${shortDate} ${user_inputs.region} ${user_inputs.service}`)
        console.log(`signingKey=${bytes.binaryToHex(outputs.signingKey).toLowerCase()}`);
        
        //Task 3: Step 2
	    outputs.signature = bytes.binaryToHex(crypto.hmacSha256(outputs.signingKey, bytes.createFromString(outputs.stringToSign))).toLowerCase();
        console.log(`signature=${outputs.signature}`);

        //Task 4:
	    outputs.auth_header = user_inputs.algo + " Credential="+ user_inputs.accessKey +"/"+ shortDate +"/"+ user_inputs.region +"/"+ user_inputs.service +"/aws4_request, SignedHeaders="+ outputs.signedHeaders +", Signature=" + outputs.signature;
        
        console.log(`Authorization=${outputs.auth_header}`)

        context.setHeader("Authorization", outputs.auth_header);
        
    });
