import classNames from "classnames";

import { LoadingSpinner } from "~/components/icons";

interface Props {
  onClick?: () => void;
  type?: "primary" | "default";
  className?: string;
  disabled?: boolean;
  htmlType?: React.ButtonHTMLAttributes<HTMLButtonElement>["type"];
  children: React.ReactNode;
  name?: string;
  value?: string;
  autoFocus?: boolean;
  loading?: boolean;
}

export default function Button({
  onClick,
  children,
  className,
  type = "default",
  disabled = false,
  htmlType,
  name,
  value,
  autoFocus,
  loading,
}: Props) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={classNames(
        className ? className : "",
        "inline-flex w-full justify-center rounded-md border px-4 py-2 text-base font-medium shadow-sm transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        "sm:w-auto sm:text-sm",
        "disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none disabled:cursor-not-allowed",
        {
          "border-transparent bg-blue-600 text-white hover:bg-blue-700":
            type === "primary",
          "border-blue-600 bg-white text-blue-600 hover:bg-slate-100 hover:text-blue-700 hover:border-blue-700":
            type === "default",
        }
      )}
      type={htmlType}
      name={name}
      value={value}
      autoFocus={autoFocus}
    >
      <div className="inline-flex justify-center gap-1">
        {loading && <LoadingSpinner />}
        {children}
      </div>
    </button>
  );
}
