import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { updateProps } from "./editor";
import type { ModelBlockFields } from "./editor";
import { currencyChoices, isKnownUnit, UNIT_GROUPS } from "./engine/units";
import {
  clampSliderValue,
  DECIMALS_AUTO,
  DECIMALS_MAX,
  FORMAT_KINDS,
  parseSelectOptions,
  serializeSelectOptions,
} from "./engine/variable";
import type { SelectOption } from "./engine/variable";
import type { FormatKind } from "./model";

const FORMAT_LABELS: Record<FormatKind, string> = {
  currency: "Currency",
  number: "Number",
  percent: "Percent",
  unit: "Unit",
};

const DECIMALS = [
  { label: "Auto", value: String(DECIMALS_AUTO) },
  ...Array.from({ length: DECIMALS_MAX + 1 }, (_, count) => ({
    label: String(count),
    value: String(count),
  })),
];

interface ChoiceItem {
  label: string;
  value: string;
}

interface ChoiceGroup {
  label?: string;
  items: ChoiceItem[];
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

function Choice({
  label,
  value,
  groups,
  onChange,
}: {
  label: string;
  value: string;
  groups: ChoiceGroup[];
  onChange: (value: string) => void;
}) {
  return (
    <Row label={label}>
      <Select
        items={groups.flatMap((group) => group.items)}
        onValueChange={(next) => {
          if (next !== null) {
            onChange(next);
          }
        }}
        value={value}
      >
        <SelectTrigger aria-label={label} className="w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group, index) => (
            <SelectGroup key={group.label ?? index}>
              {group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
              {group.items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );
}

function plain(items: readonly string[]): ChoiceGroup[] {
  return [{ items: items.map((item) => ({ label: item, value: item })) }];
}

function FormatSettings({ block, editor }: ModelBlockFields) {
  const set = (props: Record<string, unknown>) =>
    updateProps(editor, block, props);
  const format = block.props.format ?? "number";
  const decimals = block.props.decimals ?? DECIMALS_AUTO;
  const unit = block.props.unit ?? "";
  return (
    <>
      <Choice
        groups={[
          {
            items: FORMAT_KINDS.map((kind) => ({
              label: FORMAT_LABELS[kind],
              value: kind,
            })),
          },
        ]}
        label="Format"
        onChange={(next) => set({ format: next })}
        value={format}
      />
      {format === "currency" ? (
        <Choice
          groups={plain(currencyChoices(block.props.currency))}
          label="Currency"
          onChange={(currency) => set({ currency })}
          value={block.props.currency ?? ""}
        />
      ) : null}
      {format === "unit" ? (
        <Choice
          groups={[
            ...(unit && !isKnownUnit(unit) ? plain([unit]) : []),
            ...UNIT_GROUPS.map((group) => ({
              items: group.units.map((name) => ({ label: name, value: name })),
              label: group.label,
            })),
          ]}
          label="Unit"
          onChange={(next) => set({ unit: next })}
          value={unit}
        />
      ) : null}
      <Choice
        groups={[{ items: DECIMALS }]}
        label="Decimals"
        onChange={(next) => set({ decimals: Number(next) })}
        value={String(decimals)}
      />
    </>
  );
}

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
    <div className="grid grid-cols-3 gap-1.5">
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
    <div aria-label="Select options" className="flex flex-col gap-1.5">
      <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
        Options
      </p>
      {options.map((option, index) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_4rem_auto] gap-1.5"
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
        <PlusIcon />
        Add option
      </Button>
    </div>
  );
}

/** True for a block type that has settings behind its six dots. */
export function hasBlockConfig(type: string): boolean {
  return type === "number" || type === "slider" || type === "select";
}

/** Everything the six dots offer for one model block, or nothing. */
export function BlockConfig({ block, editor }: ModelBlockFields) {
  if (!hasBlockConfig(block.type)) {
    return null;
  }
  return (
    <>
      {block.type === "select" ? (
        <SelectOptions block={block} editor={editor} />
      ) : (
        <FormatSettings block={block} editor={editor} />
      )}
      {block.type === "slider" ? (
        <SliderBounds block={block} editor={editor} />
      ) : null}
    </>
  );
}
