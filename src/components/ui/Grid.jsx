/**
 * Grade responsiva de cards (auto-fit).
 * @param {{ min?: number, gap?: number, children: any, style?: object }} props
 */
export default function Grid({ min = 320, gap = 20, children, style }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
        gap,
        alignItems: 'start',
        marginBottom: gap,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
