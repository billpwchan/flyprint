import styles from "./common.module.css";

export type Column = { key: string | number; value: number; current?: boolean; label?: string };

// A small column chart inside a finding: one grey column per period, the
// period in question lighter.
export default function Columns({ columns, axis }: { columns: Column[]; axis: "ends" | "all" }) {
  const max = Math.max(...columns.map((column) => column.value), 1);
  return (
    <span className={styles.bars} aria-hidden="true">
      <span className={styles.barRow}>
        {columns.map((column) => (
          <span key={column.key} className={styles.bar} data-current={column.current ? "true" : undefined} style={{ height: `${Math.max(column.value ? 6 : 2, (column.value / max) * 100)}%` }} />
        ))}
      </span>
      <span className={styles.barAxis} data-axis={axis}>
        {axis === "ends"
          ? <><span>{columns[0]?.label}</span><span>{columns.at(-1)?.label}</span></>
          : columns.map((column) => <span key={column.key}>{column.label}</span>)}
      </span>
    </span>
  );
}
