// src/components/Container.jsx
export default function Container({ className = "", children }) {
  return (
    <div className={`container mx-auto px-4 sm:px-4 md:px-5 lg:px-6 ${className}`}>
      {children}
    </div>
  );
}