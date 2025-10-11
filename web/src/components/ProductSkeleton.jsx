export default function ProductSkeleton() {
  return (
    <div className="border rounded-lg p-4 animate-pulse">
      <div className="bg-gray-300 h-48 w-full mb-4 rounded"></div>
      <div className="bg-gray-300 h-4 w-3/4 mb-2 rounded"></div>
      <div className="bg-gray-300 h-4 w-1/2 rounded"></div>
    </div>
  );
}
