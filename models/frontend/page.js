import mongoose from "mongoose";

const cardSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  subDescription: {
    type: String,
    trim: true,
  },
});

const subSectionSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  subDescription: {
    type: String,
    trim: true,
  },
  cards: [cardSchema],
});

const faqItemSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
  },
  answer: {
    type: String,
    required: true,
  },
});

const sectionSchema = new mongoose.Schema({
  sectionId: {
    type: String, // will be provided from frontend (e.g., UUID or custom ID)
    required: true,
    trim: true,
  },
  title: {
    type: String,
    trim: true,
  },
  description: {
    type: String, // main section text (multi-line or HTML)
  },
  subDescription: {
    type: String, // optional smaller text or extra info
    trim: true,
  },
   faqs: [faqItemSchema],
   cards: [cardSchema],
subSection: subSectionSchema,
});

const seoSchema = new mongoose.Schema({
  metaTitle: {
    type: String,
    trim: true,
  },
  metaDescription: {
    type: String,
    trim: true,
  },
  openGraphImage: {
    type: String, // URL of OG image
    trim: true,
  },
});

const pageSchema = new mongoose.Schema(
  {
    pageName: {
      type: String,
      required: true,
      trim: true,
    },
    pageUrl: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    pageStatus: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    viewsCount: {
  type: Number,
  default: 0,
},
isComingSoon: {
  type: Boolean,
  default: false,
},

    seo: seoSchema,
    sections: [sectionSchema],
  },
  { timestamps: true }
);

export default mongoose.models.Page || mongoose.model("Page", pageSchema);
