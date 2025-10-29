import Blog from "../../models/frontend/blogs.js";
import streamifier from "streamifier";
import cloudinary from "../../utils/cloudinary.js";
export const createBlog = async (req, res) => {
  try {
    let featuredImageUrl = "";

    // ✅ Handle featured image upload if provided
    if (req.file) {
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      const cloudinaryUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "blog_featured_images" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });
      featuredImageUrl = cloudinaryUpload.secure_url;
    } else {
      // ✅ Default fallback image
      featuredImageUrl =
        "https://frontend-3d-exclusive.vercel.app/blogs/one.jpg";
    }

    // ✅ Extract data from request body
    const {
      title,
      slug,
      excerpt,
      content,
      status,
      publishDate,
      categories,
      tags,
      enableComments,
      seo,
    } = req.body;

    // ✅ Safely parse SEO if it’s sent as a JSON string
    let parsedSeo = seo;
    if (seo && typeof seo === "string") {
      try {
        parsedSeo = JSON.parse(seo);
      } catch (e) {
        console.error("Invalid SEO JSON:", e);
        parsedSeo = {}; // fallback to empty
      }
    }

    // ✅ Create new blog document
    const newBlog = new Blog({
      title,
      slug,
      featuredImage: featuredImageUrl,
      excerpt,
      content,
      status,
      publishDate,
      categories,
      tags,
      enableComments,
      seo: parsedSeo,
      author: req.user?._id || null, // assuming auth middleware attaches user
    });

    await newBlog.save();

    return res.status(201).json({
      success: true,
      message: "Blog post created successfully",
      blog: newBlog,
    });
  } catch (error) {
    console.error("Error creating blog:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create blog post",
      error: error.message,
    });
  }
};

export const updateBlog = async (req, res) => {
  try {
    const blogId = req.params.id;
    const existingBlog = await Blog.findById(blogId);

    if (!existingBlog) {
      return res.status(404).json({
        success: false,
        message: "Blog post not found",
      });
    }

    let featuredImageUrl = existingBlog.featuredImage;

    if (req.file) {
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      const cloudinaryUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "blog_featured_images" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });
      featuredImageUrl = cloudinaryUpload.secure_url;
    }

    const {
      title,
      slug,
      excerpt,
      content,
      status,
      publishDate,
      categories,
      tags,
      enableComments,
      seo,
    } = req.body;

    // ✅ Safely parse SEO JSON
    let parsedSeo = seo;
    if (seo && typeof seo === "string") {
      try {
        parsedSeo = JSON.parse(seo);
      } catch (e) {
        console.error("Invalid SEO JSON:", e);
      }
    }


    existingBlog.title = title ?? existingBlog.title;
    existingBlog.slug = slug ?? existingBlog.slug;
    existingBlog.featuredImage = featuredImageUrl;
    existingBlog.excerpt = excerpt ?? existingBlog.excerpt;
    existingBlog.content = content ?? existingBlog.content;
    existingBlog.status = status ?? existingBlog.status;
    existingBlog.publishDate = publishDate ?? existingBlog.publishDate;
    existingBlog.categories = categories ?? existingBlog.categories;
    existingBlog.tags = tags ?? existingBlog.tags;
    existingBlog.enableComments = enableComments ?? existingBlog.enableComments;
    existingBlog.seo = parsedSeo ?? existingBlog.seo;

    await existingBlog.save();

    return res.status(200).json({
      success: true,
      message: "Blog post updated successfully",
      blog: existingBlog,
    });
  } catch (error) {
    console.error("Error updating blog:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update blog post",
      error: error.message,
    });
  }
};


export const getAllBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find()
      .populate("author", "firstName lastName email")
      .sort({ createdAt: -1 }); // newest first

    return res.status(200).json({
      success: true,
      count: blogs.length,
      blogs,
    });
  } catch (error) {
    console.error("Error fetching blogs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch blogs",
      error: error.message,
    });
  }
};
export const getBlogById = async (req, res) => {
  try {
    // Find blog and populate author info
    const blog = await Blog.findById(req.params.id).populate("author", "name email");

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog post not found",
      });
    }

    // Increment views count
    blog.views = (blog.views || 0) + 1;
    await blog.save();

    return res.status(200).json({
      success: true,
      blog,
    });
  } catch (error) {
    console.error("Error fetching blog:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch blog post",
      error: error.message,
    });
  }
};
export const getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    // Find blog by slug and populate author info
    const blog = await Blog.findOne({ slug }).populate("author", "firstName lastName email");

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog post not found",
      });
    }

    // Increment views count
    blog.views = (blog.views || 0) + 1;
    await blog.save();

    return res.status(200).json({
      success: true,
      blog,
    });
  } catch (error) {
    console.error("Error fetching blog by slug:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch blog post",
      error: error.message,
    });
  }
};

export const deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog post not found",
      });
    }

    // ✅ Optional: Delete Cloudinary image if not default
    if (
      blog.featuredImage &&
      !blog.featuredImage.includes("one_ju3l12.png")
    ) {
      try {
        // extract Cloudinary public_id from URL
        const publicId = blog.featuredImage
          .split("/")
          .slice(-2)
          .join("/")
          .split(".")[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.warn("Cloudinary image deletion failed:", err.message);
      }
    }

    await blog.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Blog post deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting blog:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete blog post",
      error: error.message,
    });
  }
};
export const getBlogStats = async (req, res) => {
  try {
    const totalPosts = await Blog.countDocuments();
    const published = await Blog.countDocuments({ status: "published" });
    const drafts = await Blog.countDocuments({ status: "draft" });
    const scheduled = await Blog.countDocuments({ status: "scheduled" });

    return res.status(200).json({
      success: true,
      stats: {
        totalPosts,
        published,
        drafts,
        scheduled,
      },
    });
  } catch (error) {
    console.error("Error fetching blog stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch blog statistics",
      error: error.message,
    });
  }
};
export const publishScheduledBlogs = async (req, res) => {
  try {
    const now = new Date();

    // Find all blogs that are "scheduled" and have reached their publish date
    const scheduledBlogs = await Blog.find({
      status: "scheduled",
      publishDate: { $lte: now },
    });

    if (scheduledBlogs.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No scheduled blogs ready for publishing.",
      });
    }

    // Update all found blogs to "published"
    const updateResult = await Blog.updateMany(
      {
        status: "scheduled",
        publishDate: { $lte: now },
      },
      { $set: { status: "published" } }
    );

    return res.status(200).json({
      success: true,
      message: `${updateResult.modifiedCount} scheduled blog(s) published.`,
    });
  } catch (error) {
    console.error("Error publishing scheduled blogs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to publish scheduled blogs.",
      error: error.message,
    });
  }
};
