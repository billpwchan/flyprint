import Image from "next/image";
import { carrierAssets } from "../lib/data";
import styles from "./CarrierMark.module.css";

export default function CarrierMark({ airline, size = 30 }: { airline: string; size?: number }) {
  const code = airline || "--";
  const hasAsset = carrierAssets.has(code);
  return (
    <span className={styles.mark} data-carrier={code} data-monogram={hasAsset ? undefined : "true"} style={{ width: size, height: size }} aria-hidden="true">
      {hasAsset ? <Image src={`/airlines/${code}.webp`} width={size} height={size} alt="" unoptimized /> : <b>{code}</b>}
    </span>
  );
}
