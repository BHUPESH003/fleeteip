"use client";

import { createContext, useContext, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from "react";

export interface UILinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children?: ReactNode;
}

export type LinkComponent = ComponentType<UILinkProps>;

function DefaultAnchor({ href, children, ...props }: UILinkProps) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

const LinkContext = createContext<LinkComponent>(DefaultAnchor);

/**
 * @fleetip/ui is framework-free, so it can't import next/link. The app
 * injects its router-aware link once (apps/web root layout) and every
 * shared part — breadcrumbs, empty-state actions, menu items — uses it,
 * so navigation stays client-side and list filters survive Back.
 */
export function UIProvider({ link, children }: { link: LinkComponent; children: ReactNode }) {
  return <LinkContext.Provider value={link}>{children}</LinkContext.Provider>;
}

export function UILink(props: UILinkProps) {
  const LinkImpl = useContext(LinkContext);
  return <LinkImpl {...props} />;
}
