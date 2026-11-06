import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

// A shared appearance for simple form choices as well as search/filter selectors.
// Existing option children keep their labels and disabled state; Radix supplies
// keyboard navigation, focus return and a collision-aware portal in every workspace.
export function ChoiceSelect({ value, defaultValue, onChange, children, disabled, name, required, className, id, title, 'aria-label': label }: React.ComponentProps<'select'>) {
  const empty = '__resumer_empty_choice__';
  const options: {value: string; label: React.ReactNode; disabled?: boolean}[] = [];
  const visit = (nodes: React.ReactNode) => React.Children.forEach(nodes, node => {
    if (!React.isValidElement<{value?: string | number; children?: React.ReactNode; disabled?: boolean}>(node)) return;
    if (node.type === 'option') options.push({value: String(node.props.value ?? ''), label: node.props.children, disabled: node.props.disabled});
    else visit(node.props.children);
  });
  visit(children);
  return <Select value={value === undefined ? undefined : String(value) || empty} defaultValue={defaultValue === undefined ? undefined : String(defaultValue) || empty} disabled={disabled} name={name} required={required} onValueChange={next => {
    const value = next === empty ? '' : next;
    onChange?.({target: {value}, currentTarget: {value}} as React.ChangeEvent<HTMLSelectElement>);
  }}><SelectTrigger id={id} title={title} aria-label={label} className={className}><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value || empty} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectContent></Select>;
}
