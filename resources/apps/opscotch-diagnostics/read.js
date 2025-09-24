const bytes = context.bytes();
const PAYLOAD_BIN = "attachment";

function readInt(reader) {
    let byteCount = bytes.readByte(reader.read(1), 0);
    if (byteCount < 0 || byteCount > 4) throw `${byteCount} must be 1-4`;
    let intBytes = reader.read(byteCount);
    return Array.from({ length: byteCount }, (_, i) => bytes.readByte(intBytes, i) << (i * 8)).reduce((sum, byte) => sum | byte, 0);
}

function readBytes(reader) {
    let byteCount = readInt(reader);
    if (reader.available() < byteCount) throw `reader does not have ${byteCount} available: ${reader.available()}`;
    return reader.read(byteCount);
}

function readString(byteHandle) {
    let length = bytes.getSize(byteHandle);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += String.fromCharCode(bytes.readByte(byteHandle, i));
    }

    return result;
}

const reader = bytes.reader(PAYLOAD_BIN);

const response = [];

while(reader.available()) {
    var compressedMessageBytes = readBytes(reader);
    var messageBytes = bytes.gunzip(compressedMessageBytes);
    var r = readString(messageBytes);
    response.push(r);    
}

context.setBody(JSON.stringify(response));