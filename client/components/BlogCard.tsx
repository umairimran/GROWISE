import { FC } from 'react';
import { motion } from 'framer-motion';

export interface BlogPost {
  id: string;
  title: string;
  category: string;
  description: string;
  date: string;
  authorName: string;
  authorAvatar: string;
  gradient: string; // CSS gradient string for the image placeholder
  imageUrl?: string; // Optional generated image
}

interface BlogCardProps {
  post: BlogPost;
  index: number;
}

export const BlogCard: FC<BlogCardProps> = ({ post, index }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group flex flex-col bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full"
    >
      {/* Image Area */}
      <div className="relative w-full aspect-video overflow-hidden bg-gray-100">
        {post.imageUrl ? (
            <motion.img 
                src={post.imageUrl}
                alt={post.title}
                className="absolute inset-0 w-full h-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7 }}
                whileHover={{ scale: 1.05 }}
            />
        ) : (
            <motion.div 
                className="absolute inset-0 w-full h-full"
                style={{ background: post.gradient }}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.4 }}
            />
        )}
        
        {/* Floating Badge */}
        <div className="absolute top-4 left-4 z-10">
             <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm backdrop-blur-md bg-white/80 ${
                 post.category === 'Feature' ? 'text-blue-700' :
                 post.category === 'Engineering' ? 'text-purple-700' :
                 'text-gray-700'
             }`}>
                 {post.category}
             </span>
        </div>
        
        {/* Loading shimmer if no image yet (optional visual hint) */}
        {!post.imageUrl && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 translate-x-[-100%] animate-shimmer" />
        )}
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col flex-1">
        <h3 className="font-display text-xl font-semibold text-contrast mb-3 leading-tight group-hover:text-accent transition-colors">
          {post.title}
        </h3>
        <p className="text-gray-600 text-sm leading-relaxed mb-6 flex-1">
          {post.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
             <div className="flex items-center space-x-2">
                 <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                     {post.authorAvatar}
                 </div>
                 <span className="text-xs font-medium text-gray-500">{post.authorName}</span>
             </div>
             <span className="text-xs text-gray-400">{post.date}</span>
        </div>
      </div>
    </motion.div>
  );
};