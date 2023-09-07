/*
Expects
- JSON response from Create ticket

Stashs the ticket reference away

*/


body = context.getMessageBodyAsString();
jiraTicket = JSON.parse(body);
if (jiraTicket.key)
    context.setProperty("OPSCOTCH_phmActionReference", jiraTicket.key);
