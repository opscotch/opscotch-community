doc
    .dataSchema(
        {
            required : [ "hostId", "awsRegion" ],
            properties : {
                hostId : {
                    type : "string"
                },
                awsRegion : {
                    type : "string"
                }
            }
        }
    )
  .run(() => {

    const bytes = context.bytes();
    const crypto = context.crypto();

    const hostId = context.getData("hostId");
    const region = context.getData("awsRegion");
    const hostData = JSON.parse(context.getRestrictedDataFromHost(hostId));
    ["host", "service"].forEach(p => {
      if (!hostData[p]) throw `${p} expected as a data property on the ${hostId} host`;
    });

    // if this is an sts request then the tokens will be present
    let accessKey = context.getProperty("awsAccessKey");
    let secretKey = context.getProperty("awsSecretKey");
    let xAmzSecurityToken; 

    if ( !accessKey || !secretKey ) {
      // if this is not an sts request, then we USE the tokens sts got for us
      console.log("Using cached tokens")
      const stsTokensJson = context.getAuthenticationPropertiesFromStep("get-cached-tokens", "stsTokens");
      creds = JSON.parse(stsTokensJson);
      accessKey = creds.AccessKeyId;
      secretKey = creds.SecretAccessKey;
      xAmzSecurityToken = creds.SessionToken;
    
      const doThrow = (what, value) => {
        if ( !value ) {
          throw `${what} expected`;
        }
      }
      doThrow("accessKey", accessKey);
      doThrow("secretKey", secretKey);
      doThrow("xAmzSecurityToken", xAmzSecurityToken);
    }

    // ----------------------------
    // Helpers (RFC3986 + SigV4)
    // ----------------------------

    const awsEncode = (s) =>
      encodeURIComponent(String(s))
        .replace(/[!'()*]/g, c =>
          "%" + c.charCodeAt(0).toString(16).toUpperCase()
        );

    const canonicalUri = (path) => {
      if (!path || path === "") return "/";
      // Preserve slashes by encoding segments
      // Keep leading/trailing slashes as split/join preserves empty segments.
      const encoded = String(path)
        .split("/")
        .map(seg => awsEncode(seg))
        .join("/");
      // Ensure / is / (awsEncode doesn't encode it anyway, but keep defensive)
      return encoded.replace(/%2F/gi, "/");
    };

    const parseQueryPairs = (qs) => {
      if (!qs) return [];
      const s = String(qs).startsWith("?") ? String(qs).slice(1) : String(qs);
      if (!s) return [];

      const pairs = [];
      for (const part of s.split("&")) {
        if (part === "") continue;
        const idx = part.indexOf("=");
        const k = idx >= 0 ? part.slice(0, idx) : part;
        const v = idx >= 0 ? part.slice(idx + 1) : "";
        // Treat + as space, then decode
        const key = decodeURIComponent(k.replace(/\+/g, "%20"));
        const val = decodeURIComponent(v.replace(/\+/g, "%20"));
        pairs.push([key, val]);
      }
      return pairs;
    };

    const canonicalQueryString = (qs) => {
      const pairs = parseQueryPairs(qs)
        .map(([k, v]) => [awsEncode(k), awsEncode(v)])
        .sort((a, b) => {
          if (a[0] === b[0]) return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
          return a[0] < b[0] ? -1 : 1;
        });
      return pairs.map(([k, v]) => `${k}=${v}`).join("&");
    };

    const normalizeHeaderValue = (v) =>
      String(v).trim().replace(/\s+/g, " ");

    const buildCanonicalHeaders = (headerMap) => {
      const lowered = {};
      for (const [k, v] of Object.entries(headerMap)) {
        if (v === null || v === undefined) continue;
        const key = String(k).toLowerCase().trim();
        lowered[key] = normalizeHeaderValue(v);
      }
      const keys = Object.keys(lowered).sort();
      let canonical = "";
      for (const k of keys) canonical += `${k}:${lowered[k]}\n`;
      return { canonicalHeaders: canonical, signedHeaders: keys.join(";") };
    };

    const bufferSha256Hex = (b) => bytes.binaryToHex(bytes.sha256(b)).toLowerCase();
    const strSha256Hex = (str) => bufferSha256Hex(bytes.createFromString(String(str)));

    const hmacSha256 = (keyBytes, dataStr) =>
      crypto.hmacSha256(keyBytes, bytes.createFromString(String(dataStr)));

    const getSignatureKey = (secretKey, dateStamp, regionName, serviceName) => {
      const kSecret = bytes.createFromString("AWS4" + secretKey);
      const kDate = hmacSha256(kSecret, dateStamp);
      const kRegion = hmacSha256(kDate, regionName);
      const kService = hmacSha256(kRegion, serviceName);
      return hmacSha256(kService, "aws4_request");
    };

    const dateStamp = (d) =>
      d.getUTCFullYear() + ("0" + (d.getUTCMonth() + 1)).slice(-2) + ("0" + d.getUTCDate()).slice(-2);

    const amzDate = (d) =>
      d.toISOString().substring(0, d.toISOString().indexOf(".")).replace(/:/g, "").replace(/-/g, "") + "Z";

    // ----------------------------
    // Gather request data (as it will be sent)
    // ----------------------------

    const now = new Date(context.getTimestamp());
    const shortDate = dateStamp(now);
    const awsTime = amzDate(now);

    const method = String(context.getProperty("method") || "GET").toUpperCase();
    const uri = String(context.getProperty("uri") || "/");
    const queryStr = context.getProperty("queryString")
      ? String(context.getProperty("queryString")).replace("?", "")
      : "";

    // Body: assume UTF-8 text (good for Query + JSON-RPC + REST/JSON).
    // If Opscotch exposes raw body bytes, prefer them for binary workloads (e.g., S3 PutObject).
    const bodyStr = context.getBody() ?? "";

    // Content-Type: include only if present (and if you'll actually send it).
    let contentType = null;
    const ctRaw = JSON.parse(context.getHeader("Content-Type"));
    if (ctRaw.length) contentType = ctRaw[0];

    // Optional headers that impact signing across families
    const getHeaderFirst = (name) => {
      try {
        const v = context.getHeader(name);
        if (!v) return null;
        return JSON.parse(v)[0];
      } catch (_) {
        return null;
      }
    };

    const xAmzTarget = getHeaderFirst("x-amz-target"); // JSON-RPC family
    const xAmzContentSha256 = getHeaderFirst("x-amz-content-sha256"); // S3-style often requires this

    // Host header value must match actual request host (SigV4 requires it signed)
    const host = String(hostData.host).trim().replace(/\s+/g, " ");

    // ----------------------------
    // Build canonical request
    // ----------------------------

    const scope = `${shortDate}/${region}/${hostData.service}/aws4_request`;
    const algo = "AWS4-HMAC-SHA256";

    const headerMap = {
      "host": host,
      "x-amz-date": awsTime
    };

    // Only sign content-type if present (and you're going to send it)
    if (contentType) headerMap["content-type"] = contentType;

    // Include these only if you are actually sending them
    if (xAmzTarget) headerMap["x-amz-target"] = xAmzTarget;
    if (xAmzContentSha256) headerMap["x-amz-content-sha256"] = xAmzContentSha256;
    if (xAmzSecurityToken) headerMap["x-amz-security-token"] = xAmzSecurityToken;

    const { canonicalHeaders, signedHeaders } = buildCanonicalHeaders(headerMap);

    const canonUri = canonicalUri(uri);
    const canonQs = canonicalQueryString(queryStr);

    // Payload hash:
    // - For most services: SHA256 of UTF-8 body string is correct.
    // - For S3 binary bodies: you need raw bytes hashing; if Opscotch provides body bytes, swap in here.
    const hashedPayload = strSha256Hex(bodyStr);

    const canonicalRequest =
      `${method}\n` +
      `${canonUri}\n` +
      `${canonQs}\n` +
      `${canonicalHeaders}\n` +
      `${signedHeaders}\n` +
      `${hashedPayload}`;

    const hashedCanonicalRequest = strSha256Hex(canonicalRequest);

    const stringToSign =
      `${algo}\n` +
      `${awsTime}\n` +
      `${scope}\n` +
      `${hashedCanonicalRequest}`;

    // ----------------------------
    // Sign
    // ----------------------------

    const signingKey = getSignatureKey(secretKey, shortDate, region, hostData.service);
    const signature = bytes.binaryToHex(
      crypto.hmacSha256(signingKey, bytes.createFromString(stringToSign))
    ).toLowerCase();

    const authorization =
      `${algo} ` +
      `Credential=${accessKey}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, ` +
      `Signature=${signature}`;

    // ----------------------------
    // Apply headers to outgoing request (must match what we signed)
    // ----------------------------

    context.setHeader("x-amz-date", awsTime);

    console.log(`Content-Type: ${contentType}`)

    if (contentType) { context.setHeader("Content-Type", contentType); }
    if (xAmzTarget) context.setHeader("x-amz-target", xAmzTarget);
    if (xAmzContentSha256) context.setHeader("x-amz-content-sha256", xAmzContentSha256);
    if (xAmzSecurityToken) context.setHeader("x-amz-security-token", xAmzSecurityToken);

    context.setHeader("Authorization", authorization);

    // Optional debug logs (safe to remove)
    console.log(`SigV4 host=${host} service=${hostData.service} region=${region}`);
    console.log(`SigV4 amzDate=${awsTime}`);
    console.log(`SigV4 signedHeaders=${signedHeaders}`);
    console.log(`SigV4 payloadHash=${hashedPayload}`);
    console.log(`SigV4 stringToSign=${stringToSign}`);
    console.log(`SigV4 canonicalRequest=${canonicalRequest}`);
    console.log(`SigV4 canonicalRequestHash=${hashedCanonicalRequest}`);
  });