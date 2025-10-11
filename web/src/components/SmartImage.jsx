import { useState } from "react";

/**
 * SmartImage
 * - lazy loading, async decoding
 * - placeholder shimmer
 * - tryb fill: zarówno wrapper, jak i <img> wypełniają rodzica
 */
export default function SmartImage({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  fill = false, // gdy true → wrapper i img są absolute inset-0
  ...rest
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className={`
        ${fill ? "absolute inset-0" : "relative"}
        overflow-hidden
        ${className}
      `}
    >
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-neutral-200/50 dark:bg-neutral-700/40" />
      )}

      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`
          block object-cover object-center
          ${fill ? "absolute inset-0 w-full h-full" : "w-full h-full"}
          transition-opacity duration-300
          ${loaded ? "opacity-100" : "opacity-0"}
          ${imgClassName}
        `}
        {...rest}
      />
    </div>
  );
}
