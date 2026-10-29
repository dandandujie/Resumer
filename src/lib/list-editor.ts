export function createListEditor<T>(
  items: readonly T[],
  onChange: (items: T[]) => void,
  createItem: () => T,
) {
  return {
    addItem: () => onChange([...items, createItem()]),
    updateItem: (index: number, data: Partial<T>) => {
      onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...data } : item)));
    },
    removeItem: (index: number) => {
      onChange(items.filter((_, itemIndex) => itemIndex !== index));
    },
  };
}
