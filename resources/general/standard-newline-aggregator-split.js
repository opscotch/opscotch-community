/*
Takes an new line delimited file and splits each item
*/
context.diagnosticLog(context.getMessageBodyAsString());
context.getMessageBodyAsString().split("\n").forEach(line => context.addSplitReturnItem(line));