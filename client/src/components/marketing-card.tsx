import { FC } from "react";
import { motion } from "framer-motion";
import { cn } from "./ui";

export interface MarketingPost {
  id: string;
  title: string;
  category: string;
  description: string;
  date: string;
  authorName: string;
  authorAvatar: string;
  gradient: string;
  imageUrl?: string;
}

interface MarketingCardProps {
  post: MarketingPost;
  index: number;
}

export const MarketingCard: FC<MarketingCardProps> = ({ post, index }) => (
  <motion.article
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45, delay: index * 0.07 }}
    className="app-panel group flex h-full flex-col overflow-hidden"
  >
    <div className="relative aspect-[16/10] overflow-hidden">
      <div
        className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.03]"
        style={{ background: post.gradient }}
      />
      {post.imageUrl ? (
        <motion.img
          src={post.imageUrl}
          alt={post.title}
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/5 to-transparent" />
      <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-white/75 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-contrast backdrop-blur-md">
        {post.category}
      </div>
    </div>

    <div className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
      <div className="space-y-3">
        <h3 className="font-display text-2xl font-semibold tracking-[-0.03em] text-contrast">
          {post.title}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">{post.description}</p>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-contrast/10 text-xs font-bold text-contrast">
            {post.authorAvatar}
          </div>
          <div>
            <div className="text-sm font-semibold text-contrast">{post.authorName}</div>
            <div className="text-xs text-muted-foreground">{post.category}</div>
          </div>
        </div>
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{post.date}</span>
      </div>
    </div>
  </motion.article>
);

