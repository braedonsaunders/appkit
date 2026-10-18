import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyFilters, type ScheduleFilters } from "./types.js";
import {
  ScheduleDateInput,
  ScheduleFiltersBar,
  SchedulingProvider,
  type ScheduleDateInputProps,
} from "./react.js";

type Pair = [ScheduleDateInputProps, ScheduleDateInputProps];

/** A host date control that records what the surface hands it. */
function recordingDateInput(received: ScheduleDateInputProps[]) {
  return function HostDateInput(props: ScheduleDateInputProps) {
    received.push(props);
    return React.createElement("span", {
      "data-host-date": props.value,
      "aria-label": props["aria-label"],
      id: props.id,
    });
  };
}

function renderFilters(
  filters: ScheduleFilters,
  onChange: (next: ScheduleFilters) => void,
  DateInput?: (props: ScheduleDateInputProps) => React.ReactElement,
) {
  const bar = React.createElement(ScheduleFiltersBar, {
    filters,
    onChange,
    phases: [],
    assignees: [],
  });
  return renderToStaticMarkup(
    DateInput
      ? React.createElement(SchedulingProvider, { components: { DateInput }, children: bar })
      : bar,
  );
}

test("without a host control, dates render as the native date input", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ScheduleDateInput, {
      value: "2026-03-09",
      onChange: () => {},
      min: "2026-01-01",
      max: "2026-12-31",
      id: "start",
      name: "start",
      required: true,
      disabled: true,
      "aria-label": "Start",
    }),
  );
  assert.match(markup, /type="date"/);
  assert.match(markup, /value="2026-03-09"/);
  assert.match(markup, /min="2026-01-01"/);
  assert.match(markup, /max="2026-12-31"/);
  assert.match(markup, /id="start"/);
  assert.match(markup, /name="start"/);
  assert.match(markup, /required=""/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /aria-label="Start"/);
});

test("a host control replaces every filter date and receives the ISO contract", () => {
  const received: ScheduleDateInputProps[] = [];
  const markup = renderFilters(
    { ...emptyFilters, dateFrom: "2026-03-09", dateTo: null },
    () => {},
    recordingDateInput(received),
  );
  assert.doesNotMatch(markup, /type="date"/);
  assert.equal(received.length, 2);
  const [from, to] = received as Pair;
  // A set date arrives as ISO; an unset one as '', never null or undefined.
  assert.equal(from.value, "2026-03-09");
  assert.equal(to.value, "");
  assert.equal(from["aria-label"], "Start");
  assert.equal(to["aria-label"], "Finish");
  // The compact sizing still reaches the host control.
  assert.match(from.className ?? "", /h-7/);
});

test("a host control's ISO and cleared reports become the filter window", () => {
  const received: ScheduleDateInputProps[] = [];
  const reported: ScheduleFilters[] = [];
  const filters = { ...emptyFilters, dateFrom: "2026-03-09", dateTo: "2026-04-30" };
  renderFilters(filters, (next) => reported.push(next), recordingDateInput(received));
  assert.equal(received.length, 2);
  const [from, to] = received as Pair;
  from.onChange("2026-03-16");
  to.onChange("");
  assert.deepEqual(reported, [
    { ...filters, dateFrom: "2026-03-16" },
    // Clearing a bound removes it from the window rather than storing ''.
    { ...filters, dateTo: null },
  ]);
});

test("a provider that supplies no date control keeps the native default", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      SchedulingProvider,
      {
        components: {},
        children: React.createElement(ScheduleFiltersBar, {
          filters: emptyFilters,
          onChange: () => {},
          phases: [],
          assignees: [],
        }),
      },
    ),
  );
  assert.equal(markup.match(/type="date"/g)?.length, 2);
});

test("every date the surface edits goes through the replaceable control", () => {
  // The task editor's dates sit behind a tab and inside a dialog, so this
  // reads the components: the default control is the only native date input,
  // and the editor reaches all six of its dates through ScheduleDateInput.
  const reactDir = join(import.meta.dirname, "react");
  const nativeDateInputs = readdirSync(reactDir)
    .filter((file) => file.endsWith(".tsx"))
    .filter((file) => /type=["']date["']/.test(readFileSync(join(reactDir, file), "utf8")));
  assert.deepEqual(nativeDateInputs, ["date-input.tsx"]);
  const editor = readFileSync(join(reactDir, "task-editor.tsx"), "utf8");
  assert.equal(editor.match(/<ScheduleDateInput\b/g)?.length, 6);
});
