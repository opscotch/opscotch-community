const LIMIT = 25 * 1024 * 1024; // 25 MB in bytes

var payload = context.getBody();
var q = context.queue();

if (payload) {
    console.log(payload);
    q.push(payload);

    if(context.getData("forwardingHost")) {
        context.sendToStepAndForget("forward", payload);
    }

    context.end();
} else {
    // timer

    payload = q.take(1);
    while(payload[0]) {
        context.diagnosticLog("processing from queue");
        payload = payload[0];
        const files = context.files("diagnostics");
        var fileList = JSON.parse(files.list("/")).filter(e => e.type === 'FILE' && e.bytes < LIMIT);
        var fileOffSet = 0;
        var file;
        
        if (fileList && fileList.length > 0) {
            file = fileList.reduce((latest, e) => (e.modified > latest.modified ? e : latest))
            console.log(JSON.stringify(file));
            fileOffSet = file.bytes;
            file = file.name;
        } else {
            file = "diagnostic" + context.getTimestamp();
            fileOffSet = 0;
        }
        context.diagnosticLog(`file set to ${file} offset ${fileOffSet}`);


        const bytes = context.bytes();
        const compressed = bytes.gzip(bytes.createFrom(payload));

        const writeInt = (value) => {
            let byteCount;
            if (value <= 255) {
                byteCount = 1;
            } else if (value <= 65535) {
                byteCount = 2;
            } else if (value <= 16777215) {
                byteCount = 3;
            } else {
                byteCount = 4;
            }

            const BYTE_COUNT_BIN = bytes.createFrom([byteCount]);
            const INT_BIN = bytes.createFrom(Array.from({ length: byteCount }, (_, i) => {
                const value8 = (value >>> (i * 8)) & 0xFF;
                return value8 > 127 ? value8 - 256 : value8;
            }));
            const BIN = bytes.concat([BYTE_COUNT_BIN, INT_BIN]);
            bytes.release([BYTE_COUNT_BIN, INT_BIN]);

            return BIN;
        }

        const writeBytes = (bytesName) => {
            let length = bytes.getSize(bytesName);
            let LENGTH_BIN = writeInt(length);
            let BIN = bytes.concat([LENGTH_BIN, bytesName]);
            bytes.release([LENGTH_BIN]);
            return BIN;
        }

        const blob = writeBytes(compressed);

        context.diagnosticLog("writing");
        files.writeBinary(file, blob, fileOffSet);
        context.diagnosticLog("done");

        payload = q.take(1);
    }
    
}




