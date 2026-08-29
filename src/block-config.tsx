import { useComponentsContext } from "@blocknote/react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { updateProps } from "./editor";
import type { ModelBlockFields } from "./editor";
import { currencyChoices, isKnownUnit, UNIT_GROUPS } from "./engine/units";
import {
  clampSliderValue,
  DECIMALS_AUTO,
  DECIMALS_MAX,
  parseSelectOptions,
  serializeSelectOptions,
} from "./engine/variable";
import type { SelectOption } from "./engine/variable";

/**
 * What a model block offers behind its six dots.
 *
 * Nothing here belongs in the block: a block is one line of name, control, and
 * value. Format, currency, unit, decimals, slider bounds, and select options
 * are all submenus or small panels of the drag handle menu.
 */

const FORMATS = [
  { label: "Number", value: "number" },
  { label: "Currency", value: "currency" },
  { label: "Percent", value: "percent" },
  { label: "Unit", value: "unit" },
];

const DECIMALS = [
  { label: "Auto", value: DECIMALS_AUTO },
  ...Array.from({ length: DECIMALS_MAX + 1 }, (_, count) => ({
    label: String(count),
    value: count,
  })),
];

type Menu = NonNullable<
  ReturnType<typeof useComponentsContext>
>["Generic"]["Menu"];

/** One submenu of the drag handle menu: a caption, and the choices under it. */
function ChoiceSubmenu({
  menu,
  label,
  current,
  choices,
  onChoose,
}: {
  menu: Menu;
  label: string;
  current: string;
  choices: { label: string; value: string; endsGroup?: boolean }[];
  onChoose: (value: string) => void;
}) {
  return (
    <menu.Root position="right" sub>
      <menu.Trigger sub>
        <menu.Item className="bn-menu-item" subTrigger>
          {`${label}: ${current}`}
        </menu.Item>
      </menu.Trigger>
      <menu.Dropdown className="bn-menu-dropdown" sub>
        {choices.map((choice) => (
          <div key={choice.value}>
            <menu.Item
              checked={choice.value === current}
              className="bn-menu-item"
              onClick={() => onChoose(choice.value)}
            >
              {choice.label}
            </menu.Item>
            {choice.endsGroup ? <menu.Divider /> : null}
          </div>
        ))}
      </menu.Dropdown>
    </menu.Root>
  );
}

/** The format, and whichever detail that format needs. */
function FormatItems({ block, editor }: ModelBlockFields) {
  const menu = useComponentsContext()?.Generic.Menu;
  if (!menu) {
    return null;
  }
  const set = (props: Record<string, unknown>) =>
    updateProps(editor, block, props);
  const format = block.props.format ?? "number";
  const decimals = block.props.decimals ?? DECIMALS_AUTO;
  const unit = block.props.unit ?? "";
  return (
    <>
      <ChoiceSubmenu
        choices={FORMATS}
        current={format}
        label="Format"
        menu={menu}
        onChoose={(next) => set({ format: next })}
      />
      {format === "currency" ? (
        <ChoiceSubmenu
          choices={currencyChoices(block.props.currency).map((code) => ({
            label: code,
            value: code,
          }))}
          current={block.props.currency ?? ""}
          label="Currency"
          menu={menu}
          onChoose={(currency) => set({ currency })}
        />
      ) : null}
      {format === "unit" ? (
        <ChoiceSubmenu
          choices={[
            // A stored unit the groups do not carry keeps its place.
            ...(unit && !isKnownUnit(unit)
              ? [{ endsGroup: true, label: unit, value: unit }]
              : []),
            ...UNIT_GROUPS.flatMap((group, groupIndex) =>
              group.units.map((name, index) => ({
                endsGroup:
                  index === group.units.length - 1 &&
                  groupIndex < UNIT_GROUPS.length - 1,
                label: name,
                value: name,
              }))
            ),
          ]}
          current={unit}
          label="Unit"
          menu={menu}
          onChoose={(next) => set({ unit: next })}
        />
      ) : null}
      <ChoiceSubmenu
        choices={DECIMALS.map(({ label, value }) => ({
          label,
          value: String(value),
        }))}
        current={String(decimals)}
        label="Decimals"
        menu={menu}
        onChoose={(next) => set({ decimals: Number(next) })}
      />
    </>
  );
}

/** A slider's bounds. A number input takes any value, so it has none. */
function SliderBounds({ block, editor }: ModelBlockFields) {
  const { min = 0, max = 0, value = 0 } = block.props;
  const setBound = (key: "min" | "max" | "step", raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      return;
    }
    if (key === "step") {
      updateProps(editor, block, { step: next });
      return;
    }
    const nextMin = key === "min" ? Math.min(next, max) : min;
    const nextMax = key === "max" ? Math.max(next, min) : max;
    updateProps(editor, block, {
      max: nextMax,
      min: nextMin,
      value: clampSliderValue(value, nextMin, nextMax),
    });
  };
  const bounds = [
    { caption: "Min", key: "min" as const, label: "Slider minimum" },
    { caption: "Max", key: "max" as const, label: "Slider maximum" },
    { caption: "Step", key: "step" as const, label: "Slider step" },
  ];
  return (
    <div className="flex w-56 items-end gap-1.5 p-2">
      {bounds.map((bound) => (
        <label className="flex min-w-0 flex-col gap-1" key={bound.key}>
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            {bound.caption}
          </span>
          <Input
            aria-label={bound.label}
            className="h-7 w-full text-[13px]"
            onChange={(event) => setBound(bound.key, event.currentTarget.value)}
            type="number"
            value={block.props[bound.key]}
          />
        </label>
      ))}
    </div>
  );
}

/**
 * The option list of a select block. It lives here, not in the block, so the
 * block shows only the name, the choice, and the value.
 */
function SelectOptions({ block, editor }: ModelBlockFields) {
  const options = parseSelectOptions(block.props.options);
  const save = (next: SelectOption[]) => {
    const safe = next.length ? next : [{ label: "Option", value: 0 }];
    const value = safe.some((option) => option.value === block.props.value)
      ? block.props.value
      : safe[0].value;
    updateProps(editor, block, {
      options: serializeSelectOptions(safe),
      value,
    });
  };
  const edit = (index: number, patch: Partial<SelectOption>) =>
    save(
      options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option
      )
    );
  return (
    <div aria-label="Select options" className="flex w-72 flex-col gap-1.5 p-2">
      <p className="text-muted-foreground px-0.5 text-[10px] font-medium tracking-wide uppercase">
        Options
      </p>
      {options.map((option, index) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-1.5"
          key={index}
        >
          <Input
            aria-label={`Option ${index + 1} label`}
            className="h-7 text-[13px]"
            onChange={(event) =>
              edit(index, { label: event.currentTarget.value })
            }
            value={option.label}
          />
          <Input
            aria-label={`Option ${index + 1} value`}
            className="h-7 text-[13px]"
            onChange={(event) =>
              edit(index, { value: Number(event.currentTarget.value) })
            }
            type="number"
            value={option.value}
          />
          <Button
            aria-label={`Remove option ${index + 1}`}
            disabled={options.length <= 1}
            onClick={() =>
              save(options.filter((_, optionIndex) => optionIndex !== index))
            }
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        className="self-start"
        onClick={() =>
          save([
            ...options,
            { label: `Option ${options.length + 1}`, value: options.length },
          ])
        }
        size="xs"
        type="button"
        variant="outline"
      >
        + Add option
      </Button>
    </div>
  );
}

/** Everything the six dots offer for one model block, or nothing. */
export function BlockConfig({ block, editor }: ModelBlockFields) {
  const formatted = block.type === "number" || block.type === "slider";
  if (!(formatted || block.type === "select")) {
    return null;
  }
  return (
    <>
      {formatted ? <FormatItems block={block} editor={editor} /> : null}
      {block.type === "slider" ? (
        <SliderBounds block={block} editor={editor} />
      ) : null}
      {block.type === "select" ? (
        <SelectOptions block={block} editor={editor} />
      ) : null}
    </>
  );
}
