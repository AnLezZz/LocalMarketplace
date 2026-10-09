import Icon from "./Icon";

/** Inline feedback. Errors use role="alert", confirmations role="status". */
export default function Banner({ tone, children }: { tone: "error" | "success" | "info"; children: React.ReactNode }) {
  return (
    <div className={`banner banner--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={tone === "error" ? "alert" : tone === "success" ? "check" : "info"} size={20} className="banner__icon" />
      <div>{children}</div>
    </div>
  );
}
