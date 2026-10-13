import { useState, useCallback } from 'react';

/**
 * 通用文件拖拽 Hook
 * @param {Function} onFilesDropped 接收文件绝对路径数组的回调函数
 * @param {Object} options 配置项 (allowMultiple: boolean, acceptedExtensions: string[])
 */
export function useFileDrop(onFilesDropped, { allowMultiple = true, acceptedExtensions = ['.xlsx', '.xlsm', '.csv'] } = {}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  }, [isDragging]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有离开当前绑定容器时才取消高亮
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;

      const validPaths = files
        .map((f) => f.path || f.name)
        .filter(Boolean)
        .filter((filePath) => {
          if (!acceptedExtensions || !acceptedExtensions.length) return true;
          const lower = filePath.toLowerCase();
          return acceptedExtensions.some((ext) => lower.endsWith(ext));
        });

      if (!validPaths.length) return;

      if (!allowMultiple) {
        onFilesDropped(validPaths[0]);
      } else {
        onFilesDropped(validPaths);
      }
    },
    [onFilesDropped, allowMultiple, acceptedExtensions]
  );

  return {
    isDragging,
    dropProps: {
      onDragOver: handleDragOver,
      onDragEnter: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
