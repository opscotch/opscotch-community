# Task list

Add new requested work here before implementation.

## Pending

## Completed

- [x] Build an in-memory running metric catalogue. For every received metric, index field paths and observed values recursively (including nested fields), so metric search can filter by known fields and values. Exclude the metric value, timestamp, and `type=metric` from this index. Keep the catalogue memory-efficient for large metric volumes.
- [x] Replace each chart's expanding “Latest metric body” section with a modal popover that displays the complete latest metric body.
- [x] Format large chart Y-axis values using compact human-readable suffixes (for example, `1k` and `1m`).
- [x] Add metric-browser bulk actions: select all metrics matching the current search across every page, unselect all current-search matches across every page, and clear the complete selection.
- [x] Show a condensed summary of each metric's fields in metric-browser search results.
- [x] Wherever metric fields are displayed (such as the metric-body popover and search results), provide an action to add that field/value to the active filter criteria.
- [x] Add composable metric filter criteria, including “field equals this value” and “field does not equal this value,” with criteria combined for search filtering.
- [x] Add a Live connection activity status metric showing the current browser memory/byte usage of the in-memory metric catalogue and store.
