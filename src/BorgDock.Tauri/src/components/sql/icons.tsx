import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  Folder,
  LoaderCircle,
  type LucideIcon,
  type LucideProps,
  Pencil,
  Play,
  Plus,
  Search,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

type IconProps = Omit<LucideProps, 'ref' | 'fill' | 'stroke' | 'strokeWidth' | 'width' | 'height'>;

function renderIcon(Icon: LucideIcon, { size = 14, ...rest }: IconProps) {
  return <Icon size={size} strokeWidth={1.5} {...rest} />;
}

export function TerminalIcon(props: IconProps) {
  return renderIcon(Terminal, props);
}

export function CheckIcon(props: IconProps) {
  return renderIcon(Check, props);
}

export function CheckCircleIcon(props: IconProps) {
  return renderIcon(CircleCheck, props);
}

export function PlayIcon({ size = 14, ...rest }: IconProps) {
  return <Play size={size} fill="currentColor" stroke="none" {...rest} />;
}

export function ZapIcon(props: IconProps) {
  return renderIcon(Zap, props);
}

export function FolderIcon(props: IconProps) {
  return renderIcon(Folder, props);
}

export function SearchIcon(props: IconProps) {
  return renderIcon(Search, props);
}

export function ChevronLeftIcon(props: IconProps) {
  return renderIcon(ChevronLeft, props);
}

export function ChevronRightIcon(props: IconProps) {
  return renderIcon(ChevronRight, props);
}

export function ChevronDownIcon(props: IconProps) {
  return renderIcon(ChevronDown, props);
}

export function PlusIcon(props: IconProps) {
  return renderIcon(Plus, props);
}

export function CopyIcon(props: IconProps) {
  return renderIcon(Copy, props);
}

export function EditIcon(props: IconProps) {
  return renderIcon(Pencil, props);
}

export function TrashIcon(props: IconProps) {
  return renderIcon(Trash2, props);
}

export function ClockIcon(props: IconProps) {
  return renderIcon(Clock, props);
}

export function XIcon(props: IconProps) {
  return renderIcon(X, props);
}

export function SpinnerIcon({ size = 14, ...rest }: IconProps) {
  return (
    <LoaderCircle
      size={size}
      strokeWidth={2}
      style={{ animation: 'sql-spin 900ms linear infinite' }}
      {...rest}
    />
  );
}

export function AlertIcon(props: IconProps) {
  return renderIcon(CircleAlert, props);
}
