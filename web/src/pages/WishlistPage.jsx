import { useWishlist } from "../context/WishlistContext";
import ProductCard from "../components/ProductCard";
import { Link } from "react-router-dom";

export default function WishlistPage() {
  const { wishlist } = useWishlist();

  if (!wishlist.length)
    return (
      <div className="text-center mt-20 text-mainRed font-bold text-xl">
        Lista życzeń jest pusta! <br />
        <Link to="/" className="underline text-gold">Odkrywaj prezenty</Link>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto mt-10">
      <h1 className="text-3xl font-extrabold text-mainRed mb-6 text-center">Twoja lista życzeń</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-7">
        {wishlist.map(product => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </div>
  );
}
