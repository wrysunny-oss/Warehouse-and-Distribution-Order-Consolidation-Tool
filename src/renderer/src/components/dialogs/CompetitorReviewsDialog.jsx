import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export function CompetitorReviewsDialog({ item, onClose }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setQuery(''); setPage(1); }, [item]);
  const reviews = useMemo(() => (item?.reviews || []).filter(review =>
    [review.content, review.appendContent, review.sku].join(' ').toLowerCase().includes(query.trim().toLowerCase())
  ), [item, query]);
  const pages = Math.max(1, Math.ceil(reviews.length / 50));
  const currentPage = Math.min(page, pages);
  return (
    <Dialog open={Boolean(item)} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl min-w-0">
        <DialogHeader>
          <DialogTitle>全部评价 · {item?.reviews?.length || 0} 条已保存</DialogTitle>
          <DialogDescription className="break-words">{item?.title}<br />{item?.reviewStatus || '尚未采集全部评价'}</DialogDescription>
        </DialogHeader>
        <Input aria-label="搜索全部评价内容" placeholder="搜索评价、追评或购买规格" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
        <ScrollArea className="h-[min(55vh,520px)] min-w-0 rounded-md border">
          <div className="flex flex-col gap-4 p-4">
            {reviews.slice((currentPage - 1) * 50, currentPage * 50).map((review, index) => (
              <article key={review.id || `${currentPage}:${index}`} className="flex flex-col gap-2 border-b pb-4 last:border-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">#{(currentPage - 1) * 50 + index + 1}</Badge>
                  {review.date && <span>{review.date}</span>}{review.sku && <span>{review.sku}</span>}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{review.content || '仅有追评'}</p>
                {review.appendContent && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">追评：{review.appendContent}</p>}
              </article>
            ))}
            {!reviews.length && <p className="text-sm text-muted-foreground">{query ? '没有匹配的评价' : '尚未保存评价全文，请重新补采全部评价。'}</p>}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{reviews.length} 条 · 第 {currentPage} / {pages} 页</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>下一页</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
