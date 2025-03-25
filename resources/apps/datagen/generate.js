const BATCHSIZE = parseInt(context.getData("batchSize"));
const CHARSET = ' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const EMPTYSTRING = '';
const NEWLINE = '\n';
const generateRandomString = (size) => Array.from({ length: size }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join(EMPTYSTRING);
const generatePayload = (size) => Array.from({ length: size }, () => generateRandomString(100)).join(NEWLINE);
context.setBody(generatePayload(100));
context.setHttpMethod("POST");