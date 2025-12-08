"use client";

import {
  type CarouselApi,
  Carousel as CarouselBase,
  CarouselContent,
  CarouselItem as CarouselItemBase,
} from "@repo/design-system/components/ui/carousel";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

interface CarouselProps extends React.ComponentProps<typeof CarouselBase> {
  children: React.ReactNode;
}

const Carousel = ({ className, children, ...props }: CarouselProps) => {
  const [api, setApi] = React.useState<CarouselApi>();
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  React.useEffect(() => {
    if (!api) return;

    const updateScrollState = () => {
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    };

    updateScrollState();
    api.on("select", updateScrollState);
    api.on("reInit", updateScrollState);

    return () => {
      api?.off("select", updateScrollState);
      api?.off("reInit", updateScrollState);
    };
  }, [api]);

  return (
    <CarouselBase setApi={setApi} {...props}>
      <CarouselContent className="-ml-2 md:-ml-4">{children}</CarouselContent>
      {canScrollPrev && (
        <div className="absolute flex items-center justify-center left-0 top-1/2 w-10 h-full -translate-y-1/2 from-background to-transparent via-background/50 to-100% bg-linear-to-r">
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-transparent cursor-pointer hover:scale-110 transition-all duration-300"
            onClick={() => api?.scrollPrev()}
          >
            <ChevronLeft className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}
      {canScrollNext && (
        <div className="absolute flex items-center justify-center right-0 top-1/2 w-10 h-full -translate-y-1/2 from-background to-transparent via-background/50 to-100% bg-linear-to-l">
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-transparent cursor-pointer hover:scale-110 transition-all duration-300"
            onClick={() => api?.scrollNext()}
          >
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </CarouselBase>
  );
};

export interface CarouselItemProps
  extends React.ComponentProps<typeof CarouselItemBase> {
  children: React.ReactNode;
}

const CarouselItem: React.FC<CarouselItemProps> = ({ children, ...props }) => {
  return <CarouselItemBase {...props}>{children}</CarouselItemBase>;
};

export { Carousel, CarouselItem };
