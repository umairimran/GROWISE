import { useState, useEffect, FC } from 'react';
import { ArrowLeft, Sparkles, HardDrive } from 'lucide-react';
import { BlogCard, BlogPost } from '../components/BlogCard';
import { generateBlogImage } from '../services/geminiService';

interface BlogPageProps {
  onBack: () => void;
}

const INITIAL_BLOG_POSTS: BlogPost[] = [
    {
        id: '1',
        title: "Introducing the 50-minute Adaptive Assessment",
        category: "Feature",
        description: "We've rebuilt our core engine. Learn how our new adaptive logic reduces test time by 40% while increasing knowledge map accuracy.",
        date: "Oct 24, 2024",
        authorName: "Sarah Chen",
        authorAvatar: "SC",
        gradient: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)"
    },
    {
        id: '2',
        title: "How our AI generates Python curriculums",
        category: "Engineering",
        description: "A deep dive into the prompt engineering and DAG (Directed Acyclic Graph) structures we use to ensure learning paths make sense.",
        date: "Oct 12, 2024",
        authorName: "David Kim",
        authorAvatar: "DK",
        gradient: "linear-gradient(135deg, #FDF4FF 0%, #FAE8FF 100%)"
    },
    {
        id: '3',
        title: "New Feature: Real-world Validator Scenarios",
        category: "Feature",
        description: "Theory isn't enough. We are rolling out 50+ new 'Boss Fight' scenarios that simulate actual tickets from top tech companies.",
        date: "Sep 28, 2024",
        authorName: "Marcus J.",
        authorAvatar: "MJ",
        gradient: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)"
    },
    {
        id: '4',
        title: "Understanding the Knowledge Graph",
        category: "Education",
        description: "What does a 70% mastery in 'React Hooks' actually mean? We explain the math behind our confidence scores.",
        date: "Sep 15, 2024",
        authorName: "Elena R.",
        authorAvatar: "ER",
        gradient: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)"
    },
    {
        id: '5',
        title: "Scaling Supabase for 1M+ Events",
        category: "Engineering",
        description: "Lessons learned from scaling our telemetry ingestion pipeline using Supabase and PostgreSQL partitioning.",
        date: "Aug 30, 2024",
        authorName: "David Kim",
        authorAvatar: "DK",
        gradient: "linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)"
    },
    {
        id: '6',
        title: "The Future of AI Tutors",
        category: "Announcements",
        description: "Our roadmap for 2025: Voice interaction, IDE plugins, and team collaboration features.",
        date: "Aug 10, 2024",
        authorName: "Sarah Chen",
        authorAvatar: "SC",
        gradient: "linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)"
    }
];

const FILTERS = ["All", "Feature", "Engineering", "Education", "Announcements"];

export const Blog: FC<BlogPageProps> = ({ onBack }) => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [posts, setPosts] = useState<BlogPost[]>(INITIAL_BLOG_POSTS);

  // Generate images using client-side service
  useEffect(() => {
    const fetchImages = async () => {
        // We iterate through posts and generate images if they don't have one (mocking the behavior)
        // In a real app, you'd store these URLs in DB. Here we generate on the fly for the demo.
        INITIAL_BLOG_POSTS.forEach(async (post) => {
            try {
                // Use client-side service instead of server API
                const imageUrl = await generateBlogImage(post.title, post.description);
                
                if (imageUrl) {
                    setPosts(currentPosts => currentPosts.map(p => 
                        p.id === post.id ? { ...p, imageUrl } : p
                    ));
                }
            } catch (error) {
                console.error("Failed to load image for post:", post.id, error);
            }
        });
    };

    fetchImages();
  }, []);

  const filteredPosts = activeFilter === "All" 
    ? posts 
    : posts.filter(post => post.category === activeFilter);

  const pendingCount = posts.filter(p => !p.imageUrl).length;

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Navbar Placeholder / Back Button */}
      <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
         <button 
            onClick={onBack}
            className="flex items-center text-gray-500 hover:text-contrast transition-colors group text-sm font-medium"
         >
            <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Home
         </button>
         
         <div className="flex items-center space-x-3">
             {pendingCount > 0 ? (
                 <div className="flex items-center text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 animate-pulse">
                    <Sparkles className="h-3 w-3 mr-2 text-accent" />
                    Generating visuals with Gemini... ({pendingCount} left)
                 </div>
             ) : (
                 <div className="flex items-center text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
                    <HardDrive className="h-3 w-3 mr-2" />
                    All assets loaded
                 </div>
             )}
         </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-20">
        
        {/* Header Section */}
        <div className="py-16 text-center max-w-3xl mx-auto">
            <h1 className="font-display text-4xl md:text-6xl font-bold text-contrast mb-6 tracking-tight leading-[1.1]">
                Insights and updates from the Cycle team
            </h1>
            <p className="text-xl text-gray-500 leading-relaxed">
                New features, bug fixes, and learning resources to help you grow faster.
            </p>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap justify-center gap-2 mb-16">
            {FILTERS.map(filter => (
                <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300 border ${
                        activeFilter === filter
                        ? 'bg-contrast text-white border-contrast shadow-lg'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                >
                    {filter}
                </button>
            ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredPosts.map((post, index) => (
                <BlogCard key={post.id} post={post} index={index} />
            ))}
        </div>

        {filteredPosts.length === 0 && (
            <div className="text-center py-20 text-gray-400">
                No posts found for this category.
            </div>
        )}

      </div>
      
      {/* Simple Footer */}
      <div className="border-t border-border py-12 text-center text-gray-400 text-sm bg-white">
          <p>&copy; 2024 Grow Wise Inc.</p>
      </div>
    </div>
  );
};