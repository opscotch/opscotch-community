# Metric criteria UX redesign brief

## Objective

Provide one clear way to find metrics, define reusable criteria, understand the resulting boolean logic, and select matching charts. It must remain usable with tens of thousands of catalogue values and while live metrics continue to arrive.

## Core model

- A criterion is `field + operator + value`.
- A group matches when **every** one of its criteria matches (AND).
- The complete filter matches when **any** group matches (OR).
- The active filter is always visible as compact, editable chips grouped by their AND relationship. The UI must state the logic in plain language.
- The quick page search is a Name `contains` criterion, not a second, hidden filtering mechanism.
- Criteria are separate from chart selection. A matching metric is not selected automatically; the user can select all matching metrics, subject to the chart cap.

## Criterion authoring

Use one contextual criterion editor rather than a permanently visible top-of-page form. It opens only after an explicit action—such as “Add criterion” within a group or “Add alternative group”—and is visually anchored to that action/group. It closes after add, cancel, or escape, retaining no distracting empty editor in the default view.

The editor is a single, ordered row: **Field → operator → value → add**.

- Fields include Name, Metric value, and catalogue field paths.
- The field control is a searchable combobox. It renders a bounded result list and allows a typed field path that has not been seen yet.
- Operators are determined by the field and value type:
  - Name and string fields: `is`, `is not`, `contains`.
  - Numeric metric value: `is`, `is not`, `greater than`, `at least`, `less than`, `at most`, `is non-zero`.
  - Other fields: `is`, `is not`; add `contains` when string values are known.
- Exact known values use a searchable, bounded picker. `contains`, numeric comparisons, and as-yet unseen values use a text/number input.
- A manually typed value must be represented exactly as a criterion and must match when a future metric first contains it.
- “Add criterion” on a group opens the editor bound to that group and extends its AND conditions. “Add alternative group” opens the same editor for a new OR group. Group creation and removal must be obvious, reversible actions.

## Discovery and result interaction

- The static main-page search input opens the browser overlay without moving the page layout.
- Opening is immediate; result calculation may follow asynchronously with a brief loading state.
- Search results show metric name, latest value/time, compact field summaries, and selected state.
- Each field summary has clearly distinct include and exclude actions. Applying either immediately updates the active criteria and gives local, non-layout-shifting confirmation.
- The metric body popover offers the same include/exclude actions for all flattened fields.
- Bulk actions operate across every matching page: select filtered (respecting the chart cap), unselect filtered, and clear selection.

## Chart visibility search

- Provide a separate, always-available chart search input for filtering the currently selected chart cards by metric name and deployment ID.
- This controls visibility only: it must not change chart selection, criteria, subscriptions, stored history, or live data collection for hidden charts.
- Clearing the chart search immediately restores all selected chart cards.

## Persistence and live behaviour

- Persist complete criteria—groups, operators, values, manual criteria, and the quick Name query—in local storage. Restore them before the browser is opened so criteria and filtered results cannot diverge after reload.
- Re-evaluate active criteria against newly received metrics on a bounded cadence while the browser is open. New matches must appear without user action; high-frequency input must not cause a full filter pass on every frame.
- Controls must retain focus and their in-progress values while live data updates.

## Performance and accessibility

- Do not render unbounded option lists. Searchable pickers display a limited number of results and explain how to narrow them.
- Keep criteria evaluation, catalogue updates, and chart rendering independently batched/debounced to favour input responsiveness.
- Use labelled, keyboard-operable controls and announce the meaning of filter actions; visual colour must not be the only include/exclude distinction.

## Acceptance scenarios

1. Before any matching metrics exist, create `dimensionMap.error is true`; reload; then receive a metric with that field and see it appear in filtered results.
2. Create `region is west` and `Name contains requests` in one group, then add `region is east` and `Name contains requests` as an alternative group; results obey `(west AND requests) OR (east AND requests)` and the chips make that clear.
3. Search a catalogue with tens of thousands of values without a giant native select or dropped focus while live data arrives.
4. Apply a filter from a result field or metric body and see the criteria update immediately without disruptive layout movement.
5. Select all filtered metrics across pages, observe the chart cap, reload, and retain the criteria while chart selection continues to use its existing persistence.
