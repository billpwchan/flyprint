import Link from "next/link";
import styles from "./common.module.css";

// A person beside a flight or a trip: a dot in their colour and a few words,
// leading to the page the two of you share when there is one.
export default function Owner({ color, label, href }: { color: string; label: string; href?: string }) {
  const style = { "--tone": color } as React.CSSProperties;
  const content = <><i aria-hidden="true" />{label}</>;
  return href
    ? <Link href={href} className={styles.owner} style={style}>{content}</Link>
    : <span className={styles.owner} style={style}>{content}</span>;
}
