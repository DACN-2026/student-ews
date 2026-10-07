import TextLabel from "@/components/ui/TextLabel";
import React from 'react';

type SeverityLevel = 'XANH' | 'VANG' | 'DO';

interface LevelBadgeProps {
  level: SeverityLevel;
  className?: string;
}

export default function LevelBadge({ level, className = '' }: LevelBadgeProps) {
  const config = {
    XANH: {
      label: 'Bình thường',
      classes: 'text-emerald-700'
    },
    VANG: {
      label: 'Giám sát',
      classes: 'text-amber-700'
    },
    DO: {
      label: 'Khẩn cấp',
      classes: 'text-red-700'
    }
  };

  const { label, classes } = config[level] || config.XANH;

  return (
    <TextLabel className={`text-xs font-medium ${classes} ${className}`}>
      {label}
    </TextLabel>
  );
}
