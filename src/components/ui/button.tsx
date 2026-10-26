import Link from "next/link";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./button.module.css";

type ButtonVariant = "primary" | "glass" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

type ButtonAsLinkProps = ButtonBaseProps & { href: string };
type ButtonAsButtonProps = ButtonBaseProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof ButtonBaseProps> & { href?: undefined };

function buttonClasses(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return cn(styles.button, styles[variant], variant === "glass" && "liquid-glass", styles[size], className);
}

/*
 * Design-system button. Pass `href` for navigation (renders a prefetching <Link>);
 * omit it for actions. Colours come from the surrounding [data-surface].
 */
export function Button(props: ButtonAsLinkProps | ButtonAsButtonProps): React.ReactElement {
  if (props.href !== undefined) {
    const { variant = "primary", size = "md", className, style, children, href } = props;
    return (
      <Link href={href} className={buttonClasses(variant, size, className)} style={style}>
        {children}
      </Link>
    );
  }

  const { variant = "primary", size = "md", className, children, type = "button", ...rest } = props;
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}
