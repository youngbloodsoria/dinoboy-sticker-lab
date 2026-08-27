// Admin comment moderation for Brighton update comments.
// Comments stay private until reviewed; public pages only show aggregate counts.

(() => {
  const commentsClient = window.DinoBoySupabase?.client;
  const commentsStatus = document.querySelector("#commentsStatus");
  const commentsList = document.querySelector("#commentsList");
  const commentStats = document.querySelector("#commentStats");
  const commentSearch = document.querySelector("#commentSearch");
  const commentStatusFilter = document.querySelector("#commentStatusFilter");
  const refreshCommentsButton = document.querySelector("#refreshCommentsButton");
  const commentsTab = document.querySelector('[data-workspace-tab="comments"]');

  let commentsLoaded = false;
  let commentsCache = [];
  let updateTitleMap = {};

  if (!commentsStatus || !commentsList) {
    return;
  }

  const escapeCommentHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));

  const setCommentsStatus = (message, type = "info") => {
    commentsStatus.textContent = message;
    commentsStatus.dataset.type = type;
    commentsStatus.hidden = false;
  };

  const clearCommentsStatus = () => {
    commentsStatus.textContent = "";
    commentsStatus.removeAttribute("data-type");
    commentsStatus.hidden = true;
  };

  const supabaseMessage = (error) => {
    if (!error) {
      return "Unknown Supabase error";
    }

    return [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" ");
  };

  const formatCommentDate = (value) => value
    ? new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value))
    : "Unknown date";

  const liveUpdateIdFromKey = (updateKey = "") => updateKey.startsWith("live:")
    ? updateKey.replace("live:", "")
    : "";

  const displayUpdateName = (updateKey = "") => {
    const liveId = liveUpdateIdFromKey(updateKey);
    if (liveId && updateTitleMap[liveId]) {
      return updateTitleMap[liveId];
    }

    return updateKey
      .replace(/^archive:/, "Archived update: ")
      .replace(/^live:/, "Live update: ")
      .replaceAll(":", " / ")
      .replaceAll("-", " ");
  };

  const loadUpdateTitles = async (comments) => {
    const liveIds = [...new Set(comments.map((comment) => liveUpdateIdFromKey(comment.update_key)).filter(Boolean))];
    if (!liveIds.length) {
      updateTitleMap = {};
      return;
    }

    const { data, error } = await commentsClient
      .from("site_updates")
      .select("id,title")
      .in("id", liveIds);

    if (error) {
      console.warn("Could not load update titles for comments", error);
      updateTitleMap = {};
      return;
    }

    updateTitleMap = (data || []).reduce((titles, update) => {
      titles[update.id] = update.title;
      return titles;
    }, {});
  };

  const renderCommentStats = () => {
    const counts = commentsCache.reduce((summary, comment) => {
      summary[comment.status] = (summary[comment.status] || 0) + 1;
      return summary;
    }, { pending: 0, approved: 0, hidden: 0 });

    commentStats.innerHTML = [
      ["Pending", counts.pending || 0],
      ["Approved", counts.approved || 0],
      ["Hidden", counts.hidden || 0]
    ].map(([label, value]) => `
      <div class="comment-stat">
        <strong>${value}</strong>
        <span>${escapeCommentHtml(label)}</span>
      </div>
    `).join("");
  };

  const filteredComments = () => {
    const status = commentStatusFilter.value || "pending";
    const searchTerm = commentSearch.value.trim().toLowerCase();

    return commentsCache.filter((comment) => {
      const statusMatches = status === "all" || comment.status === status;
      if (!statusMatches) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      return [
        comment.commenter_name,
        comment.comment_text,
        comment.update_key,
        displayUpdateName(comment.update_key)
      ].some((value) => String(value || "").toLowerCase().includes(searchTerm));
    });
  };

  const actionButtons = (comment) => {
    const actions = [];

    if (comment.status !== "approved") {
      actions.push(`<button class="mini-button" type="button" data-comment-action="approved" data-comment-id="${escapeCommentHtml(comment.id)}">Approve</button>`);
    }

    if (comment.status !== "pending") {
      actions.push(`<button class="mini-button secondary" type="button" data-comment-action="pending" data-comment-id="${escapeCommentHtml(comment.id)}">Pending</button>`);
    }

    if (comment.status !== "hidden") {
      actions.push(`<button class="mini-button secondary" type="button" data-comment-action="hidden" data-comment-id="${escapeCommentHtml(comment.id)}">Hide</button>`);
    }

    return actions.join("");
  };

  const renderComments = () => {
    renderCommentStats();
    const comments = filteredComments();

    if (!comments.length) {
      commentsList.innerHTML = `<div class="empty">No comments in this view.</div>`;
      return;
    }

    commentsList.innerHTML = comments.map((comment) => `
      <article class="comment-card" data-status="${escapeCommentHtml(comment.status)}">
        <div>
          <strong>${escapeCommentHtml(comment.commenter_name || "Anonymous")}</strong>
          <span>${escapeCommentHtml(formatCommentDate(comment.created_at))}</span>
          <small class="comment-update-key">${escapeCommentHtml(displayUpdateName(comment.update_key))}</small>
          <small>Status: ${escapeCommentHtml(comment.status)}</small>
        </div>
        <p class="comment-text">${escapeCommentHtml(comment.comment_text)}</p>
        <div class="comment-actions">
          ${actionButtons(comment)}
        </div>
      </article>
    `).join("");
  };

  const loadComments = async () => {
    clearCommentsStatus();

    if (!commentsClient) {
      setCommentsStatus("Supabase is not configured.", "error");
      return;
    }

    commentsList.innerHTML = `<div class="empty">Loading comments...</div>`;

    const { data, error } = await commentsClient
      .rpc("admin_list_update_comments");

    if (error) {
      console.error("Could not load update comments", error);
      setCommentsStatus(`Could not load comments. Supabase says: ${supabaseMessage(error)}. Run the latest supabase/schema.sql, then supabase/rls.sql.`, "error");
      commentsList.innerHTML = `<div class="empty">Comments unavailable.</div>`;
      return;
    }

    commentsCache = data || [];
    await loadUpdateTitles(commentsCache);
    renderComments();
    commentsLoaded = true;
  };

  const updateCommentStatus = async (commentId, status) => {
    const { error } = await commentsClient
      .rpc("admin_set_update_comment_status", {
        comment_id: commentId,
        next_status: status
      });

    if (error) {
      console.error("Could not update comment status", error);
      setCommentsStatus(`Could not update that comment. Supabase says: ${error.message}`, "error");
      return;
    }

    commentsCache = commentsCache.map((comment) => (
      comment.id === commentId ? { ...comment, status } : comment
    ));
    setCommentsStatus(`Comment moved to ${status}.`, "success");
    renderComments();
  };

  commentsList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-comment-action]");
    if (!button) {
      return;
    }

    button.disabled = true;
    await updateCommentStatus(button.dataset.commentId, button.dataset.commentAction);
  });

  commentsTab?.addEventListener("click", async () => {
    await loadComments();
  });

  refreshCommentsButton?.addEventListener("click", loadComments);
  commentStatusFilter?.addEventListener("change", renderComments);
  commentSearch?.addEventListener("input", renderComments);

  window.addEventListener("dinoboy:admin-ready", async () => {
    if (commentsTab?.getAttribute("aria-selected") === "true" || commentsLoaded) {
      await loadComments();
    }
  });
})();
