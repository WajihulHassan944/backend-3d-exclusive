import streamifier from "streamifier";
import cloudinary from "../../utils/cloudinary.js";
import page from "../../models/frontend/page.js";
import { v4 as uuidv4 } from "uuid";

export const createPage = async (req, res) => {
  try {
    let ogImageUrl = "";

    // ✅ Upload OG image if provided
    if (req.file) {
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      const cloudinaryUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "page_og_images" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });
      ogImageUrl = cloudinaryUpload.secure_url;
    } else {
      // ✅ Default fallback OG image
      ogImageUrl = "https://frontend-3d-exclusive.vercel.app/default-og-image.jpg";
    }

    // ✅ Extract from request body
    const { pageName, pageUrl, pageStatus, seo, sections } = req.body;

    // ✅ Parse SEO safely
    let parsedSeo = seo;
    if (seo && typeof seo === "string") {
      try {
        parsedSeo = JSON.parse(seo);
      } catch (e) {
        console.error("Invalid SEO JSON:", e);
        parsedSeo = {};
      }
    }

    // ✅ Parse sections safely
    let parsedSections = sections;
    if (sections && typeof sections === "string") {
      try {
        parsedSections = JSON.parse(sections);
      } catch (e) {
        console.error("Invalid sections JSON:", e);
        parsedSections = [];
      }
    }

// ✅ Ensure each section has nested cards + subsections handled
parsedSections = parsedSections.map((sec) => ({
  sectionId: sec.sectionId || uuidv4(),
  title: sec.title,
  description: sec.description,
  subDescription: sec.subDescription || "",

  // ✅ Handle cards inside each section
  cards: Array.isArray(sec.cards)
    ? sec.cards.map((card) => ({
        cardId: card.cardId || uuidv4(),
        title: card.title || "",
        description: card.description || "",
        image: card.image || "",
      }))
    : [],

// ✅ Handle subSection (singular, matches schema)
subSection: sec.subSection
  ? {
      subSectionId: sec.subSection.subSectionId || uuidv4(),
      title: sec.subSection.title || "",
      description: sec.subSection.description || "",
      subDescription: sec.subSection.subDescription || "",
      cards: Array.isArray(sec.subSection.cards)
        ? sec.subSection.cards.map((card) => ({
            cardId: card.cardId || uuidv4(),
            title: card.title || "",
            description: card.description || "",
            subDescription: card.subDescription || "",
          }))
        : [],
    }
  : null,


  // ✅ Handle FAQs
  faqs: Array.isArray(sec.faqs)
    ? sec.faqs.map((f) => ({
        question: f.question,
        answer: f.answer,
      }))
    : [],
}));


    // ✅ Assign OG image to SEO if not already set
    if (!parsedSeo.openGraphImage) {
      parsedSeo.openGraphImage = ogImageUrl;
    }

    // ✅ Create and save the page
    const newPage = new page({
      pageName,
      pageUrl,
      pageStatus,
      seo: parsedSeo,
      sections: parsedSections,
    });

    await newPage.save();

    return res.status(201).json({
      success: true,
      message: "Page created successfully",
      page: newPage,
    });
  } catch (error) {
    console.error("Error creating page:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create page",
      error: error.message,
    });
  }
};




export const getAllPages = async (req, res) => {
  try {
    const pages = await page.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, pages });
  } catch (error) {
    console.error("Error fetching pages:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch pages",
      error: error.message,
    });
  }
};

export const getAllPagesAdminSide = async (req, res) => {
  try {
    const pages = await page.find({}, "pageName pageUrl pageStatus viewsCount sections updatedAt").sort({ createdAt: -1 });

    const formattedPages = pages.map((p) => ({
      _id: p._id,
      name: p.pageName,
      url: p.pageUrl,
      status: p.pageStatus.charAt(0).toUpperCase() + p.pageStatus.slice(1), // e.g. Published
      sectionsCount: p.sections?.length || 0,
      views: p.viewsCount.toLocaleString(), // e.g. 15,420
      modified: p.updatedAt ? p.updatedAt.toISOString().split("T")[0] : null, // e.g. 2024-01-15
    }));

    return res.status(200).json({ success: true, pages: formattedPages });
  } catch (error) {
    console.error("Error fetching pages:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch pages",
      error: error.message,
    });
  }
};


/**
 * GET PAGE BY ID
 */
// 📘 Get Page by ID (and increment view count)
export const getPageById = async (req, res) => {
  try {
    const pageByUrl = await page.findById(req.params.id);
    if (!pageByUrl)
      return res.status(404).json({ success: false, message: "Page not found" });

    // ✅ Increment viewsCount
    pageByUrl.viewsCount = (pageByUrl.viewsCount || 0) + 1;
    await pageByUrl.save();

    return res.status(200).json({ success: true, pageByUrl });
  } catch (error) {
    console.error("Error fetching page by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch page",
      error: error.message,
    });
  }
};
// 📘 Get Page by URL (and increment view count)
export const getPageByUrl = async (req, res) => {
  try {
    let { url } = req.params;

    // ✅ Ensure URL always starts with "/"
    if (!url.startsWith("/")) url = `/${url}`;

    const pageByUrl = await page.findOne({ pageUrl: url });
    if (!pageByUrl)
      return res.status(404).json({ success: false, message: "Page not found" });

    // ✅ Increment viewsCount
    pageByUrl.viewsCount = (pageByUrl.viewsCount || 0) + 1;
    await pageByUrl.save();

    return res.status(200).json({ success: true, pageByUrl });
  } catch (error) {
    console.error("Error fetching page by URL:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch page",
      error: error.message,
    });
  }
};


/**
 * UPDATE PAGE
 */export const updatePage = async (req, res) => {
  try {
    let ogImageUrl;

    // ✅ Optional OG image upload to Cloudinary
    if (req.file) {
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "page_og_images" },
          (error, result) => (result ? resolve(result) : reject(error))
        );
        bufferStream.pipe(stream);
      });
      ogImageUrl = uploadResult.secure_url;
    }

    // ✅ Extract request data
    const { pageName, pageUrl, pageStatus, seo, sections } = req.body;

    // ✅ Safely parse JSON if sent as string
    let parsedSeo = typeof seo === "string" ? JSON.parse(seo || "{}") : seo;
    let parsedSections =
      typeof sections === "string" ? JSON.parse(sections || "[]") : sections;

    // ✅ Assign OG image if uploaded
    if (ogImageUrl) parsedSeo.openGraphImage = ogImageUrl;

    // ✅ Ensure nested cards + subSection handled
    parsedSections = parsedSections.map((sec) => ({
      sectionId: sec.sectionId || uuidv4(),
      title: sec.title,
      description: sec.description,
      subDescription: sec.subDescription || "",

      // ✅ Cards
      cards: Array.isArray(sec.cards)
        ? sec.cards.map((card) => ({
            cardId: card.cardId || uuidv4(),
            title: card.title || "",
            description: card.description || "",
            subDescription: card.subDescription || "",
          }))
        : [],

      // ✅ Subsection (singular, matches schema)
      subSection: sec.subSection
        ? {
            subSectionId: sec.subSection.subSectionId || uuidv4(),
            title: sec.subSection.title || "",
            description: sec.subSection.description || "",
            subDescription: sec.subSection.subDescription || "",
            cards: Array.isArray(sec.subSection.cards)
              ? sec.subSection.cards.map((card) => ({
                  cardId: card.cardId || uuidv4(),
                  title: card.title || "",
                  description: card.description || "",
                  subDescription: card.subDescription || "",
                }))
              : [],
          }
        : null,

      // ✅ FAQs
      faqs: Array.isArray(sec.faqs)
        ? sec.faqs.map((f) => ({
            question: f.question,
            answer: f.answer,
          }))
        : [],
    }));

    // ✅ Update the page document
    const updatedPage = await page.findByIdAndUpdate(
      req.params.id,
      {
        pageName,
        pageUrl,
        pageStatus,
        seo: parsedSeo,
        sections: parsedSections,
      },
      { new: true }
    );

    if (!updatedPage) {
      return res
        .status(404)
        .json({ success: false, message: "Page not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Page updated successfully",
      page: updatedPage,
    });
  } catch (error) {
    console.error("Error updating page:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update page",
      error: error.message,
    });
  }
};



/**
 * DELETE PAGE
 */
export const deletePage = async (req, res) => {
  try {
    const pageToDelete = await page.findByIdAndDelete(req.params.id);
    if (!pageToDelete)
      return res.status(404).json({ success: false, message: "Page not found" });

    return res.status(200).json({
      success: true,
      message: "Page deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting page:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete page",
      error: error.message,
    });
  }
};




export const getPageStats = async (req, res) => {
  try {

    const pages = await page.find();

    const totalPages = pages.length;
    const publishedPages = pages.filter((p) => p.pageStatus === "published").length;
    const draftPages = pages.filter((p) => p.pageStatus === "draft").length;
    const totalViews = pages.reduce((sum, p) => sum + (p.viewsCount || 0), 0);

    return res.status(200).json({
      success: true,
      stats: {
        totalPages,
        publishedPages,
        draftPages,
        totalViews,
      },
    });
  } catch (error) {
    console.error("Error fetching page stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch page stats",
      error: error.message,
    });
  }
};




// ✅ GET SEO of Home Page
export const getHomeSeo = async (req, res) => {
  try {
    // Find the page where pageUrl is "/"
    const homePage = await page.findOne({ pageUrl: "/" }).select("seo");

    if (!homePage) {
      return res.status(404).json({
        success: false,
        message: "Home page not found",
      });
    }

    return res.status(200).json({
      success: true,
      seo: homePage.seo,
    });
  } catch (error) {
    console.error("Error fetching home SEO:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch home SEO",
      error: error.message,
    });
  }
};



// ✅ Toggle isComingSoon for ALL pages
export const toggleComingSoon = async (req, res) => {
  try {
    const { isComingSoon } = req.body;

    if (typeof isComingSoon !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isComingSoon must be a boolean",
      });
    }

    // Update all pages
    await page.updateMany({}, { isComingSoon });

    return res.status(200).json({
      success: true,
      message: `isComingSoon updated to ${isComingSoon} for all pages`,
    });
  } catch (error) {
    console.error("Error updating coming soon:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update coming soon",
      error: error.message,
    });
  }
};


export const getComingSoonStatus = async (req, res) => {
  try {
    const anyPage = await page.findOne().select("isComingSoon");

    if (!anyPage) {
      return res.status(404).json({
        success: false,
        message: "No pages found",
      });
    }

    return res.status(200).json({
      success: true,
      isComingSoon: anyPage.isComingSoon,
    });
  } catch (error) {
    console.error("Error fetching ComingSoon state:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Coming Soon state",
      error: error.message,
    });
  }
};