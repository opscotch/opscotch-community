doc
    .description("Normalize GitHub issue comments response")
    .asUserErrors()
    .inSchema({
        oneOf: [
            {
                type: "array",
                description: "GitHub REST issue comments response.",
                items: {
                    type: "object",
                    additionalProperties: true,
                    properties: {
                        id: {
                            oneOf: [
                                { type: "integer" },
                                { type: "string" }
                            ]
                        },
                        node_id: { type: "string" },
                        body: { type: "string" },
                        user: {
                            type: "object",
                            additionalProperties: true,
                            properties: {
                                login: { type: "string" }
                            }
                        },
                        author: { type: "string" },
                        created_at: { type: "string" },
                        updated_at: { type: "string" },
                        html_url: { type: "string" },
                        path: { type: "string" },
                        line: {
                            oneOf: [
                                { type: "integer" },
                                { type: "null" }
                            ]
                        },
                        original_line: {
                            oneOf: [
                                { type: "integer" },
                                { type: "null" }
                            ]
                        },
                        diff_hunk: { type: "string" },
                        resolved: { type: "boolean" },
                        is_resolved: { type: "boolean" },
                        isResolved: { type: "boolean" },
                        thread_resolved: { type: "boolean" },
                        threadResolved: { type: "boolean" }
                    }
                }
            },
            {
                type: "object",
                description: "GitHub GraphQL pullRequest.reviewThreads response.",
                required: ["data"],
                additionalProperties: true,
                properties: {
                    data: {
                        type: "object",
                        required: ["repository"],
                        additionalProperties: true,
                        properties: {
                            repository: {
                                type: "object",
                                required: ["pullRequest"],
                                additionalProperties: true,
                                properties: {
                                    pullRequest: {
                                        type: "object",
                                        required: ["reviewThreads"],
                                        additionalProperties: true,
                                        properties: {
                                            reviewThreads: {
                                                type: "object",
                                                required: ["nodes"],
                                                additionalProperties: true,
                                                properties: {
                                                    nodes: {
                                                        type: "array",
                                                        items: {
                                                            type: "object",
                                                            additionalProperties: true,
                                                            required: ["id", "isResolved", "comments"],
                                                            properties: {
                                                                id: { type: "string" },
                                                                isResolved: { type: "boolean" },
                                                                comments: {
                                                                    type: "object",
                                                                    required: ["nodes"],
                                                                    additionalProperties: true,
                                                                    properties: {
                                                                        nodes: {
                                                                            type: "array",
                                                                            items: {
                                                                                type: "object",
                                                                                additionalProperties: true,
                                                                                required: ["id"],
                                                                                properties: {
                                                                                    id: { type: "string" },
                                                                                    databaseId: { type: "integer" },
                                                                                    body: { type: "string" },
                                                                                    author: {
                                                                                        type: "object",
                                                                                        additionalProperties: true,
                                                                                        properties: {
                                                                                            login: { type: "string" }
                                                                                        }
                                                                                    },
                                                                                    createdAt: { type: "string" },
                                                                                    updatedAt: { type: "string" },
                                                                                    url: { type: "string" },
                                                                                    path: { type: "string" },
                                                                                    line: {
                                                                                        oneOf: [
                                                                                            { type: "integer" },
                                                                                            { type: "null" }
                                                                                        ]
                                                                                    },
                                                                                    originalLine: {
                                                                                        oneOf: [
                                                                                            { type: "integer" },
                                                                                            { type: "null" }
                                                                                        ]
                                                                                    },
                                                                                    diffHunk: { type: "string" }
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ]
    })
    .outSchema({
        type: "object",
        required: ["status", "comments", "comments_count", "omitted_resolved_comments_count"],
        additionalProperties: true,
        properties: {
            status: { type: "string" },
            comments: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: true,
                    properties: {
                        id: {
                            oneOf: [
                                { type: "integer" },
                                { type: "string" }
                            ]
                        },
                        node_id: { type: "string" },
                        body: { type: "string" },
                        user: {
                            type: "object",
                            additionalProperties: true,
                            properties: {
                                login: { type: "string" }
                            }
                        },
                        author: { type: "string" },
                        created_at: { type: "string" },
                        updated_at: { type: "string" },
                        html_url: { type: "string" },
                        path: { type: "string" },
                        line: {
                            oneOf: [
                                { type: "integer" },
                                { type: "null" }
                            ]
                        },
                        original_line: {
                            oneOf: [
                                { type: "integer" },
                                { type: "null" }
                            ]
                        },
                        diff_hunk: { type: "string" },
                        review_thread_id: { type: "string" },
                        review_thread_resolved: { type: "boolean" }
                    }
                }
            },
            comments_count: { type: "integer" },
            omitted_resolved_comments_count: { type: "integer" }
        }
    })
    .run(() => {
        var parsed = JSON.parse(context.getBody());
        var comments = [];
        var omittedResolvedCount = 0;

        function isResolvedComment(comment) {
            return comment && (
                comment.resolved === true ||
                comment.is_resolved === true ||
                comment.isResolved === true ||
                comment.thread_resolved === true ||
                comment.threadResolved === true
            );
        }

        function normalizeGraphqlComment(comment, thread) {
            return {
                id: comment.databaseId ?? comment.id,
                node_id: comment.id,
                body: comment.body ?? "",
                user: {
                    login: comment.author?.login ?? "unknown"
                },
                author: comment.author?.login ?? "unknown",
                created_at: comment.createdAt ?? "",
                updated_at: comment.updatedAt ?? "",
                html_url: comment.url ?? "",
                path: comment.path,
                line: comment.line,
                original_line: comment.originalLine,
                diff_hunk: comment.diffHunk,
                review_thread_id: thread.id,
                review_thread_resolved: thread.isResolved === true
            };
        }

        if (Array.isArray(parsed)) {
            for (var i = 0; i < parsed.length; i += 1) {
                if (isResolvedComment(parsed[i])) {
                    omittedResolvedCount += 1;
                } else {
                    comments.push(parsed[i]);
                }
            }
        } else {
            var threads = parsed.data.repository.pullRequest.reviewThreads.nodes;
            for (var t = 0; t < threads.length; t += 1) {
                var thread = threads[t];
                var threadComments = thread.comments.nodes;
                if (thread.isResolved === true) {
                    omittedResolvedCount += threadComments.length;
                    continue;
                }
                for (var c = 0; c < threadComments.length; c += 1) {
                    comments.push(normalizeGraphqlComment(threadComments[c], thread));
                }
            }
        }

        context.setBody(JSON.stringify({
            status: "ok",
            comments: comments,
            comments_count: comments.length,
            omitted_resolved_comments_count: omittedResolvedCount
        }));
    });
