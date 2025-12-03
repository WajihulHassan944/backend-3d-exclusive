import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // optional if guest comments allowed
    },
    name: {
      type: String,
      required: true, // display name
      trim: true,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false } // no separate _id for nested subdocs
);

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    featuredImage: {
  type: String,
  trim: true,
  default: function () {
    return `/media/${this.slug}`; // placeholder, auto-resolved via virtual
  },
},

    excerpt: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    content: {
      type: String, // markdown or HTML
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "scheduled"],
      default: "draft",
    },
     views: {
      type: Number,
      default: 0, // Counts how many times the blog has been viewed
    },
    commentsCount: {
      type: Number,
      default: 0, // Will auto-update when comments are added/deleted
    },
    publishDate: {
      type: Date,
      default: Date.now,
    },
    categories: [
      {
        type: String,
        enum: [
          "Tutorials",
          "Getting Started",
          "Advanced",
          "Pricing",
          "Guide",
          "News",
          "Updates",
          "Insights"
        ],
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    enableComments: {
      type: Boolean,
      default: true,
    },
    comments: [commentSchema],

    seo: {
      title: {
        type: String,
        trim: true,
        maxlength: 60,
      },
      description: {
        type: String,
        trim: true,
        maxlength: 160,
      },
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);
blogSchema.pre("save", function (next) {
  this.commentsCount = this.comments.length;
  next();
});


// Auto-resolve featured image from Media collection
blogSchema.virtual("featuredImageUrl").get(async function () {
  const Media = mongoose.model("Media");
  const mediaRecord = await Media.findOne({ identifier: `${this.slug}` });
  return mediaRecord?.url || this.featuredImage;
});

export default mongoose.models.Blog || mongoose.model("Blog", blogSchema);
