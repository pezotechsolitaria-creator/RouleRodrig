"use client";

import { useId } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, X } from "lucide-react";

export type GridImage = { id: string; url: string; uploading?: boolean };

function SortableThumb({
  image, index, total, onRemove,
}: { image: GridImage; index: number; total: number; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-dark-card ${isDragging ? "z-10 opacity-70" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt="" className="h-full w-full object-cover" />
      {image.uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark/60">
          <Loader2 size={18} className="animate-spin text-yellow" />
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(image.id)}
        aria-label="Remove photo"
        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-dark/80 text-offwhite opacity-0 transition-opacity hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={13} />
      </button>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder — photo ${index + 1} of ${total}`}
        className="absolute bottom-1 left-1 flex h-7 w-7 cursor-grab items-center justify-center rounded-full bg-dark/80 text-offwhite/70 opacity-0 transition-opacity active:cursor-grabbing focus-visible:opacity-100 group-hover:opacity-100"
      >
        <GripVertical size={13} />
      </button>
    </div>
  );
}

/**
 * Accessible sortable image grid — mouse drag, touch drag, and keyboard
 * (Tab to the grip handle, Space to pick up, arrow keys to move, Space to
 * drop) via dnd-kit's built-in sensors, rather than hand-rolling HTML5 drag
 * events (which don't work on touch and need custom ARIA wiring to be
 * keyboard-operable at all).
 */
export default function SortableImageGrid({
  images, onReorder, onRemove,
}: {
  images: GridImage[];
  onReorder: (newOrder: GridImage[]) => void;
  onRemove: (id: string) => void;
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = images.findIndex((i) => i.id === active.id);
    const newIndex = images.findIndex((i) => i.id === over.id);
    onReorder(arrayMove(images, oldIndex, newIndex));
  }

  if (images.length === 0) return null;

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((image, index) => (
            <SortableThumb key={image.id} image={image} index={index} total={images.length} onRemove={onRemove} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
