doc
    .inSchema(
        {
            type : "object",
            required: [ "command" ],
            properties : {
                oneOf : [
                    {
                        type : "object",
                        required : [ "command", "detail"],
                        properties : {
                            command : {
                                type : "string",
                                constant : "cache"
                            },
                            detail : {
                                required : [ "keys", "x"],
                                properties : {
                                    keys : {
                                        type: "array",
                                        items : {
                                            type: "object",
                                            required : [ "kid", "alg"],
                                            properties : {
                                                kid : {
                                                    type : "string"
                                                },
                                                alg : {
                                                    type : "string",
                                                    enum : [ "EdDSA" ]
                                                },
                                                x : {
                                                    type : "string"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        type : "object",
                        required : [ "command", "detail"],
                        properties : {
                            command : {
                                type : "string",
                                constant : "auth"
                            },
                            detail : {
                                type : "object",
                                required : [ "token", "path", "method" ],
                                properties : {
                                    token : {
                                        type : "string"
                                    },
                                    path : {
                                        type : "string"
                                    },
                                    method : {
                                        type : "string"
                                    }
                                }
                            }
                        }
                    }
                ]
            }
        }
    )
    .dataSchema(
        {
            type : "object",
            properties : {
                issuer : {
                    type : "string"
                },
                audience : {
                    type : "string"
                },
                rules : {
                    type : "array",
                    items : {
                        type : "object",
                        required : [ "uriPattern", "requireRole" ],
                        properties : {
                            uriPattern : {
                                type : "string"
                            },
                            method : {
                                type : "string",
                                enum : [ "GET", "POST", "DELETE", "OPTIONS", "HEAD", "PATCH" ]
                            },
                            requireRole : {
                                type : "string"
                            }
                        }
                    }
                }
            }
        }
    )
    .run(() => {
        const bytes = context.bytes();
        const crypto = context.crypto();
        console.log(context.getBody());
        var json = JSON.parse(context.getBody());

        if (json.command == "cache") {
            var keys = JSON.stringify(json.detail)
            var hash = bytes.binaryToHex(crypto.hash(bytes.createFromString(keys)));
            context.setPersistedItem("keys", keys);
            context.diagnosticLog(`IdP certs updated: hash: ${hash}`);

        } else if (json.command == "auth") {

            const base64UrlToBase64 = (base64url) => {
                
                const mapped = new Array(base64url.length);
                for (let i = 0; i < base64url.length; i++) {
                    const ch = base64url.charCodeAt(i);
                    mapped[i] = ch === 45 /* '-' */ ? "+" : ch === 95 /* '_' */ ? "/" : base64url[i];
                }
                let base64 = mapped.join("");
                const pad = base64.length % 4;
                if (pad === 2) base64 += "==";
                else if (pad === 3) base64 += "=";
                else if (pad !== 0) throw new Error("Invalid base64url string");

                return base64;
            }

            const readString = (buffer) => {
                const len = bytes.getSize(buffer);
                console.log(`reading buffer; size ${len}`)

                const readByte = (idx) => bytes.readByte(buffer, idx) & 0xFF;
                let out = "";
                let offset = 0;

                while (offset < len) {
                    const byte1 = readByte(offset);

                    if (byte1 < 0x80) {
                        out += String.fromCharCode(byte1);
                        offset += 1;
                        continue;
                    }

                    const needMore = (count) => {
                        if (offset + count >= len) {
                            out += "\uFFFD";
                            offset = len;
                            return true;
                        }
                        return false;
                    };

                    if ((byte1 & 0xE0) === 0xC0) {
                        if (needMore(1)) continue;
                        const byte2 = readByte(offset + 1);
                        if ((byte2 & 0xC0) !== 0x80) {
                            out += "\uFFFD";
                            offset += 1;
                            continue;
                        }
                        const codePoint = ((byte1 & 0x1F) << 6) | (byte2 & 0x3F);
                        out += String.fromCharCode(codePoint);
                        offset += 2;
                    } else if ((byte1 & 0xF0) === 0xE0) {
                        if (needMore(2)) continue;
                        const byte2 = readByte(offset + 1);
                        const byte3 = readByte(offset + 2);
                        if ((byte2 & 0xC0) !== 0x80 || (byte3 & 0xC0) !== 0x80) {
                            out += "\uFFFD";
                            offset += 1;
                            continue;
                        }
                        const codePoint = ((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F);
                        out += String.fromCharCode(codePoint);
                        offset += 3;
                    } else if ((byte1 & 0xF8) === 0xF0) {
                        if (needMore(3)) continue;
                        const byte2 = readByte(offset + 1);
                        const byte3 = readByte(offset + 2);
                        const byte4 = readByte(offset + 3);
                        if (
                            (byte2 & 0xC0) !== 0x80 ||
                            (byte3 & 0xC0) !== 0x80 ||
                            (byte4 & 0xC0) !== 0x80
                        ) {
                            out += "\uFFFD";
                            offset += 1;
                            continue;
                        }
                        let codePoint = ((byte1 & 0x07) << 18) |
                            ((byte2 & 0x3F) << 12) |
                            ((byte3 & 0x3F) << 6) |
                            (byte4 & 0x3F);
                        codePoint -= 0x10000;
                        out += String.fromCharCode(
                            0xD800 + ((codePoint >> 10) & 0x3FF),
                            0xDC00 + (codePoint & 0x3FF)
                        );
                        offset += 4;
                    } else {
                        out += "\uFFFD";
                        offset += 1;
                    }
                }

                return out;
            }

            const accessToken = json.detail.token.replace("Bearer ", "");
            
            const parts = accessToken.split(".");
            if (parts.length != 3) {
                return false; // malformed JWT
            }
            const headerB64Url = parts[0];
            const payloadB64Url = parts[1];
            const signatureB64Url = parts[2];

            const headersString = readString(bytes.base64ToBinary(base64UrlToBase64(headerB64Url)));
            const headersJson = JSON.parse(headersString);
            const keysString = context.getPersistedItem("keys") || "[]";
            const keysJson = JSON.parse(keysString);
            const keyList = Array.isArray(keysJson) ? keysJson : Array.isArray(keysJson.keys) ? keysJson.keys : [];
            const key = keyList.find((k) => k.kid === headersJson.kid);
            
            const keyId = crypto.registerKey("sign", "public", bytes.binaryToHex(bytes.base64ToBinary(base64UrlToBase64(key.x))))

            const signatureBytes = bytes.base64ToBinary(base64UrlToBase64(signatureB64Url));
            const signedContent = bytes.createFromString(headerB64Url + "." + payloadB64Url);
            
            const verified = crypto.verifySignature(signatureBytes, signedContent, keyId);
            console.log(`JWT verified ${verified}`)

            const payloadString = readString(bytes.base64ToBinary(base64UrlToBase64(payloadB64Url)));
            console.log(payloadString);
            const payloadJson = JSON.parse(payloadString);

            if (payloadJson.exp) {
                const now = context.getTimestamp() / 1000;
                console.log(`payload exp ${payloadJson.exp}, system: ${now}`)
                if (payloadJson.exp < now) {
                    throw `token expired ${now - payloadJson.exp} ago`;   
                }
            }

            if (payloadJson.iss) {
                var expectedIss = context.getData("issuer");
                if (!expectedIss) {
                    throw `issuer is not set on data`;
                }
                if (expectedIss != payloadJson.iss) {
                    throw `jwt iss ${payloadJson.iss} does not match expected issuer ${expectedIss}`;
                }
            }

            if (payloadJson.aud) {
                var expectedAud = context.getData("audience");
                if (!expectedAud) {
                    throw `audience is not set on data`;
                }
                if (expectedAud != payloadJson.aud) {
                    throw `jwt aud ${payloadJson.aud} does not match expected audience ${expectedAud}`;
                }
            }

            if ( ! ( payloadJson.resource_access && payloadJson.resource_access[payloadJson.aud] && payloadJson.resource_access[payloadJson.aud].roles) ) {
                throw `Excepted resource_access[${payloadJson.aud}].roles in JWT`;
            }

            const roles = payloadJson.resource_access[payloadJson.aud].roles;
            console.log(`Roles : ${JSON.stringify(roles)}`)

            var valid = false;

            // check roles
            const rules = JSON.parse(context.getData("rules"));
            const sorted = rules.sort((a, b) => b.uriPattern.length - a.uriPattern.length);
            for (const r of sorted) {

                console.log(`testing ${JSON.stringify(r)}`)

                if (r.method && r.method !== json.detail.method.toUpperCase()) continue;

                try {
                    const re = new RegExp(r.uriPattern);
                    console.log(`testing ${json.detail.path} against ${r.uriPattern} ${re.test(json.detail.path)}`)
                    if (re.test(json.detail.path)) {
                        console.log(`Path match`);
                        valid = roles.includes(r.requireRole);
                        console.log(`Role ${r.requireRole} valid ${valid}`);
                        break;
                    }
                } catch (_e) {
                    continue;
                }
            }

            console.log(`Role valid ${valid}`);
            context.setProperty("auth_valid", valid);
        }        
    });
