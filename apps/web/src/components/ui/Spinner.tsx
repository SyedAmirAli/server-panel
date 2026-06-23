export function Spinner({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-8 w-8' };
  return (
    <div
      className={`${sizes[size]} animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600 ${className}`}
    />
  );
}
