import { useCallback, useEffect, useMemo, useState } from "react"
import { Icon } from "./Icon"
import { ChatComposer, ChatMessageList } from "./Chat"
import { Alert, LoadingState, OrderProgress, StatusBadge } from "./ui"
import { api, errorMessage } from "../lib/api"
import { formatDate, formatMoney, formatPrice, initials } from "../lib/format"
import { googleMapsUrlForCoordinates } from "../lib/googleMaps"
import { getStaffSocket } from "../lib/realtime"
import {
  fulfillmentLabels,
  customerPaymentChoiceLabels,
  orderStatusLabel,
  paymentMethodLabels,
  paymentModeLabels,
  paymentStatusLabels,
  roleLabels,
} from "../lib/labels"
import type {
  ChatMessagePayload,
  Conversation,
  OrderDetail,
  StaffMember,
  StaffUser,
} from "../types"

const assignmentRoleLabel = (role: string) =>
  role === "TECHNICIAN"
    ? "Technicien"
    : role === "DELIVERY"
      ? "Livreur"
      : (roleLabels[role] ?? role)

export function OrderDetailPanel({
  orderId,
  user,
  onClose,
  onChanged,
  notify,
}: {
  orderId: string
  user: StaffUser
  onClose: () => void
  onChanged: () => void
  notify: (message: string, tone?: "success" | "error" | "info") => void
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [comment, setComment] = useState("")
  const [rejectReason, setRejectReason] = useState("")
  const [members, setMembers] = useState<StaffMember[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  const [leadStaffId, setLeadStaffId] = useState("")
  const [assignmentInstructions, setAssignmentInstructions] = useState("")
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("ESPECES")
  const [paymentReference, setPaymentReference] = useState("")
  const [note, setNote] = useState("")
  const [selectedConversationId, setSelectedConversationId] =
    useState<string>("")
  const [chatOpen, setChatOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const actions = order?.availableActions ?? []
  const canConfirm = actions.includes("confirm")
  const canReject = actions.includes("reject")
  const canAssign = actions.includes("assign")
  const canStart = actions.includes("start")
  const canDeliver = actions.includes("deliver")
  const canFail = actions.includes("fail")
  const canPickup = actions.includes("pickup")
  const canManage =
    user.role === "DIRECTOR" ||
    user.role === "EMPLOYEE" ||
    user.role === "COMMERCIAL"
  const cashHandoverPending =
    order?.status === "LIVREE" &&
    order.fulfillmentMode === "LIVRAISON" &&
    order.customerPaymentChoice === "ESPECES"
  const hasDeliveryCoordinates =
    order !== null &&
    order.deliveryLatitude !== null &&
    order.deliveryLongitude !== null
  let deliveryMapUrl = order?.deliveryMapUrl ?? null
  if (
    !deliveryMapUrl &&
    order &&
    order.deliveryLatitude !== null &&
    order.deliveryLongitude !== null
  ) {
    deliveryMapUrl = googleMapsUrlForCoordinates(
      order.deliveryLatitude,
      order.deliveryLongitude,
    )
  }
  const hasDeliveryPoint =
    Boolean(order?.deliveryMapUrl) || hasDeliveryCoordinates
  // Le paiement déclaré par le client (espèces ou mobile) ne bloque pas la
  // validation de la livraison par le chef d’équipe : la régularisation
  // s’effectue ensuite (espèces) ou après vérification de la capture (mobile).
  const paymentDeclared =
    order?.customerPaymentChoice === 'ESPECES' ||
    order?.customerPaymentChoice === 'FLOOZ' ||
    order?.customerPaymentChoice === 'MIXX_BY_YAS'
  // Pour la remise des espèces au bureau (cash handover), le paiement est
  // toujours requis même si le client a déclaré espèces (le paiement n'a pas
  // encore été encaissé).
  const paymentRequired =
    (order?.remainingDue ?? 0) > 0 &&
    (cashHandoverPending || !paymentDeclared)
  const canRecordPaymentHere =
    Boolean(order) &&
    paymentRequired &&
    (cashHandoverPending
      ? user.role === "DIRECTOR" || user.role === "COMMERCIAL"
      : canManage &&
        order?.fulfillmentMode !== "LIVRAISON" &&
        [
          "COMMANDE_ACCEPTEE",
          "COMMANDE_EN_PREPARATION",
        ].includes(order?.status ?? ""))

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false
      if (!silent) setLoading(true)
      setError(null)
      try {
        const data = await api.orders.get(orderId)
        setOrder(data)
        // Un rechargement silencieux (message temps réel, envoi dans le chat) ne
        // doit pas écraser un montant de paiement en cours de saisie.
        if (!silent)
          setPaymentAmount(String(Math.max(0, data.total - data.paidAmount)))
        const clientConversation = data.conversations.find(
          (conversation) => conversation.visibility === "CLIENT",
        )
        setSelectedConversationId(
          (current) =>
            current ||
            clientConversation?.id ||
            data.conversations[0]?.id ||
            "",
        )
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [orderId],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Rafraîchit la commande et la conversation dès qu'un message arrive
  // dans le salon temps réel de cette commande.
  useEffect(() => {
    const socket = getStaffSocket()
    if (!socket) return
    const join = () => socket.emit("join:order", orderId)
    const onMessage = (payload: { orderId?: string }) => {
      if (payload?.orderId === orderId) void load({ silent: true })
    }
    join()
    socket.on("connect", join)
    socket.on("message:new", onMessage)
    return () => {
      socket.off("connect", join)
      socket.off("message:new", onMessage)
    }
  }, [orderId, load])

  useEffect(() => {
    if (!chatOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [chatOpen])

  useEffect(() => {
    if (!canAssign) return
    api.admin
      .staffMembers()
      .then(setMembers)
      .catch(() => setMembers([]))
  }, [canAssign])

  const run = async (
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ) => {
    setBusy(key)
    setActionError(null)
    try {
      await action()
      notify(success, "success")
      await load()
      onChanged()
    } catch (err) {
      const message = errorMessage(err)
      setActionError(message)
      notify(message, "error")
    } finally {
      setBusy(null)
    }
  }

  const selectedConversation: Conversation | undefined = useMemo(
    () =>
      order?.conversations.find(
        (conversation) => conversation.id === selectedConversationId,
      ),
    [order, selectedConversationId],
  )

  // Tous les intervenants terrain sont proposés : le besoin réel (livreur,
  // technicien ou les deux) est validé par le backend à partir des articles.
  const assignableMembers = useMemo(
    () =>
      members.filter(
        (member) => member.role === "DELIVERY" || member.role === "TECHNICIAN",
      ),
    [members],
  )

  const messageCount =
    order?.conversations.reduce(
      (total, conversation) => total + conversation.messages.length,
      0,
    ) ?? 0

  const sendChatMessage = async (payload: ChatMessagePayload) => {
    if (!selectedConversation)
      throw new Error("Aucune conversation sélectionnée.")
    await api.conversations.reply(selectedConversation.id, payload)
    await load({ silent: true })
  }

  if (loading) {
    return (
      <div className="order-panel">
        <div className="order-panel-head">
          <h2>Commande</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="x" />
          </button>
        </div>
        <LoadingState />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="order-panel">
        <div className="order-panel-head">
          <h2>Commande</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="x" />
          </button>
        </div>
        <div className="order-panel-body">
          <Alert tone="error">{error || "Commande introuvable."}</Alert>
          <button className="secondary" onClick={() => void load()}>
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="order-panel">
      <div className="order-panel-head">
        <div>
          <span className="eyebrow">
            {order.categoryType === "GPS"
              ? "Commande GPS"
              : "Commande boissons"}
          </span>
          <h2>{order.orderNumber}</h2>
          <small>{order.trackingCode}</small>
        </div>
        <div className="order-panel-actions">
          <button
            className="order-chat-button"
            onClick={() => setChatOpen(true)}
          >
            <Icon name="chat" size={18} />
            <span>Messages</span>
            {messageCount > 0 && <b>{messageCount}</b>}
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="x" />
          </button>
        </div>
      </div>

      <div className="order-panel-body">
        <OrderProgress
          status={order.status}
          fulfillmentMode={order.fulfillmentMode}
          reachedStatuses={order.history.map((entry) => entry.toStatus)}
        />
        <div className="order-badges">
          <StatusBadge
            status={order.status}
            fulfillmentMode={order.fulfillmentMode}
          />
          <StatusBadge status={order.paymentStatus} kind="payment" />
          {order.fulfillmentMode === "RETRAIT_AGENCE" &&
            order.pickupDeadlineAt &&
            order.status !== "LIVREE" && (
              <span className="status info">
                Retrait avant le {formatDate(order.pickupDeadlineAt)}
              </span>
            )}
        </div>

        <div className="order-facts">
          <div>
            <span>Client</span>
            <strong>{order.customerName}</strong>
            <small>{order.customerPhone}</small>
          </div>
          <div>
            <span>Réception</span>
            <strong>{fulfillmentLabels[order.fulfillmentMode]}</strong>
            <small>{paymentModeLabels[order.paymentMode]}</small>
            {order.customerPaymentChoice && (
              <small>
                Choix client :{" "}
                {customerPaymentChoiceLabels[order.customerPaymentChoice] ??
                  order.customerPaymentChoice}
              </small>
            )}
          </div>
          <div>
            <span>Total</span>
            <strong>{formatPrice(order.total)}</strong>
            <small>
              Payé : {formatMoney(order.paidAmount)} · Reste :{" "}
              {formatMoney(order.remainingDue)}
            </small>
          </div>
          <div>
            <span>Affectation</span>
            <strong>
              {order.assignments.some((assignment) => assignment.active)
                ? order.assignments
                    .filter((assignment) => assignment.active)
                    .map(
                      (assignment) =>
                        `${assignment.staff.name} (${assignmentRoleLabel(assignment.staff.role)})${
                          assignment.isLead ? " ★" : ""
                        }`,
                    )
                    .join(", ")
                : "Non affectée"}
            </strong>
            <small>
              {order.assignments.find(
                (assignment) => assignment.isLead && assignment.active,
              )
                ? "Chef d’équipe désigné"
                : order.assignments.some((assignment) => assignment.active)
                  ? "Aucun chef désigné"
                  : "—"}
            </small>
          </div>
        </div>

        {order &&
          (order.deliveryAddress || order.deliveryZone || hasDeliveryPoint) && (
            <div className="order-block">
              <h3>Livraison</h3>
              {(order.deliveryZone || order.deliveryAddress) && (
                <p>
                  {[order.deliveryZone, order.deliveryAddress]
                    .filter(Boolean)
                    .join(" — ")}
                </p>
              )}
              {hasDeliveryCoordinates && (
                <small className="order-map-coordinates">
                  Point GPS : {order.deliveryLatitude!.toFixed(6)},{" "}
                  {order.deliveryLongitude!.toFixed(6)}
                </small>
              )}
              {deliveryMapUrl && (
                <a
                  className="order-map-link"
                  href={deliveryMapUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="map" size={16} /> Ouvrir le point sur Google Maps
                </a>
              )}
              {order.deliveryInstructions && (
                <small>{order.deliveryInstructions}</small>
              )}
            </div>
          )}

        <div className="order-block">
          <h3>Articles</h3>
          <ul className="order-lines">
            {order.items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.productName} × {item.quantity}
                </span>
                <strong>{formatPrice(item.lineTotal)}</strong>
              </li>
            ))}
          </ul>
        </div>

        {actionError && <Alert tone="error">{actionError}</Alert>}

        {(canConfirm || canReject) && (
          <div className="order-block action-block">
            <h3>Confirmation</h3>
            <p className="muted">
              Contactez le client, puis confirmez ou rejetez la commande.
            </p>
            <label>
              Commentaire public facultatif
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Ex. Confirmée par téléphone."
              />
            </label>
            <div className="action-row">
              {canConfirm && (
                <button
                  className="primary small"
                  disabled={busy === "confirm"}
                  onClick={() =>
                    void run(
                      "confirm",
                      () => api.orders.confirm(order.id, comment || undefined),
                      "Commande confirmée.",
                    )
                  }
                >
                  {busy === "confirm"
                    ? "Confirmation…"
                    : "Confirmer la commande"}
                </button>
              )}
              {canReject && (
                <button
                  className="secondary small danger"
                  disabled={busy === "reject"}
                  onClick={() => {
                    if (rejectReason.trim().length < 3) {
                      setActionError(
                        "Saisissez un motif de rejet (au moins 3 caractères) avant de rejeter la commande.",
                      )
                      return
                    }
                    void run(
                      "reject",
                      () => api.orders.reject(order.id, rejectReason.trim()),
                      "Commande rejetée.",
                    )
                  }}
                >
                  {busy === "reject" ? "Rejet…" : "Rejeter la commande"}
                </button>
              )}
            </div>
            {canReject && (
              <label>
                Motif du rejet (obligatoire)
                <textarea
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="Ex. Le client confirme ne pas avoir passé cette commande."
                />
              </label>
            )}
          </div>
        )}

        {canPickup && (
          <div className="order-block action-block">
            <h3>Retrait en agence</h3>
            <p className="muted">
              Retrait attendu avant{" "}
              <strong>
                {order.pickupDeadlineAt
                  ? formatDate(order.pickupDeadlineAt)
                  : "72 heures après l’acceptation de la commande"}
              </strong>
              . Au-delà, la commande est annulée automatiquement.
            </p>
            {paymentRequired && (
              <Alert tone="warning">
                Le paiement intégral est requis avant de confirmer le retrait.
                Reste à payer :{" "}
                <strong>{formatMoney(order.remainingDue)}</strong>.
              </Alert>
            )}
            <label>
              Commentaire facultatif
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Ex. Retrait effectué par le client en agence."
              />
            </label>
            <button
              className="primary small"
              disabled={busy === "pickup" || paymentRequired}
              title={
                paymentRequired
                  ? "Enregistrez d’abord le paiement intégral."
                  : undefined
              }
              onClick={() =>
                void run(
                  "pickup",
                  () => api.orders.pickup(order.id, comment || undefined),
                  "Retrait confirmé — commande retirée en agence.",
                )
              }
            >
              {busy === "pickup" ? "Validation…" : "Confirmer le retrait"}
            </button>
          </div>
        )}

        {canStart && (
          <div className="order-block action-block">
            <h3>Course</h3>
            <p className="muted">
              La commande est en préparation. Seul le chef d’équipe désigné peut
              démarrer la course.
            </p>
            <label>
              Commentaire facultatif
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Ex. Départ de l’agence."
              />
            </label>
            <button
              className="primary small"
              disabled={busy === "start"}
              onClick={() =>
                void run(
                  "start",
                  () => api.orders.start(order.id, comment || undefined),
                  "Course démarrée.",
                )
              }
            >
              {busy === "start" ? "Démarrage…" : "Démarrer la course"}
            </button>
          </div>
        )}

        {(canDeliver || canFail) && (
          <div className="order-block action-block">
            <h3>Résultat de la livraison</h3>
            <p className="muted">
              Validez la remise effective, ou déclarez un échec avec un motif.
              Une commande en échec n’est jamais enregistrée comme livrée.
            </p>
            {paymentRequired && (
              <Alert tone="warning">
                Le paiement intégral est requis avant de valider la livraison.
                Reste à payer :{" "}
                <strong>{formatMoney(order.remainingDue)}</strong>.
              </Alert>
            )}
            <label>
              Observations / motif d’échec
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Ex. Client absent, colis remis au voisin…"
              />
            </label>
            <div className="action-row">
              {canDeliver && (
                <button
                  className="primary small"
                  disabled={busy === "deliver" || paymentRequired}
                  title={
                    paymentRequired
                      ? "Enregistrez d’abord le paiement intégral."
                      : undefined
                  }
                  onClick={() =>
                    void run(
                      "deliver",
                      () => api.orders.deliver(order.id, comment || undefined),
                      "Livraison validée.",
                    )
                  }
                >
                  {busy === "deliver" ? "Validation…" : "Valider la livraison"}
                </button>
              )}
              {canFail && (
                <button
                  className="secondary small danger"
                  disabled={busy === "fail"}
                  onClick={() => {
                    if (!comment.trim()) {
                      setActionError(
                        "Un motif est obligatoire pour déclarer un échec de livraison.",
                      )
                      return
                    }
                    void run(
                      "fail",
                      () => api.orders.fail(order.id, comment.trim()),
                      "Échec de livraison enregistré.",
                    )
                  }}
                >
                  {busy === "fail"
                    ? "Enregistrement…"
                    : "Déclarer un échec de livraison"}
                </button>
              )}
            </div>
          </div>
        )}

        {canAssign && (
          <div className="order-block action-block">
            <h3>Affectation des intervenants</h3>
            <p className="muted">
              Sélectionnez un ou plusieurs livreurs et/ou techniciens, puis
              désignez exactement un chef d’équipe.
            </p>
            {assignableMembers.length === 0 ? (
              <p className="muted">
                Aucun intervenant disponible pour cette commande.
              </p>
            ) : (
              <>
                <fieldset className="assignment-team">
                  <legend>Intervenants à affecter</legend>
                  {assignableMembers.map((member) => {
                    const selected = selectedStaffIds.includes(member.id)
                    return (
                      <div className="assignment-member" key={member.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...selectedStaffIds, member.id]
                                : selectedStaffIds.filter(
                                    (id) => id !== member.id,
                                  )
                              setSelectedStaffIds(next)
                              if (next.length === 0) setLeadStaffId("")
                              else if (!next.includes(leadStaffId))
                                setLeadStaffId(next[0])
                            }}
                          />
                          <span>
                            {member.name} — {assignmentRoleLabel(member.role)}
                          </span>
                        </label>
                        {selected && (
                          <button
                            className={`icon-btn ${
                              leadStaffId === member.id ? "selected-lead" : ""
                            }`}
                            type="button"
                            title={
                              leadStaffId === member.id
                                ? "Chef du groupe"
                                : "Désigner comme chef du groupe"
                            }
                            aria-label={
                              leadStaffId === member.id
                                ? `${member.name}, chef du groupe`
                                : `Désigner ${member.name} comme chef du groupe`
                            }
                            aria-pressed={leadStaffId === member.id}
                            onClick={() => setLeadStaffId(member.id)}
                          >
                            <Icon name="leader" size={17} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </fieldset>
                <p className="muted">
                  Chef d’équipe :{" "}
                  <strong>
                    {assignableMembers.find(
                      (member) => member.id === leadStaffId,
                    )?.name ?? "à désigner"}
                  </strong>
                </p>
                <label>
                  Consignes facultatives
                  <input
                    value={assignmentInstructions}
                    onChange={(event) =>
                      setAssignmentInstructions(event.target.value)
                    }
                    placeholder="Ex. Appeler avant de passer."
                  />
                </label>
                <button
                  className="secondary small"
                  disabled={
                    selectedStaffIds.length === 0 ||
                    !leadStaffId ||
                    busy === "assign"
                  }
                  onClick={() => {
                    if (
                      !leadStaffId ||
                      !selectedStaffIds.includes(leadStaffId)
                    ) {
                      setActionError(
                        "Désignez un chef parmi les intervenants sélectionnés.",
                      )
                      return
                    }
                    void run(
                      "assign",
                      () =>
                        api.orders.assign(
                          order.id,
                          selectedStaffIds,
                          leadStaffId,
                          assignmentInstructions || undefined,
                        ),
                      `Commande affectée à ${selectedStaffIds.length} intervenant(s).`,
                    )
                  }}
                >
                  {busy === "assign"
                    ? "Affectation…"
                    : `Valider l’affectation (${selectedStaffIds.length})`}
                </button>
              </>
            )}
          </div>
        )}
        {canRecordPaymentHere && (
          <div className="order-block action-block">
            <h3>
              {cashHandoverPending
                ? "Remise des espèces au bureau"
                : "Encaissement"}
            </h3>
            <p className="muted">
              Reste à payer : <strong>{formatMoney(order.remainingDue)}</strong>
              .{" "}
              {cashHandoverPending
                ? "Saisissez le montant remis par l’équipe au retour. La date, l’heure et le membre du personnel connecté seront enregistrés automatiquement."
                : "Le paiement intégral doit être enregistré avant de valider la livraison ou le retrait."}
            </p>
            <div className="inline-form">
              <label>
                Montant (FCFA)
                <input
                  type="number"
                  min={1}
                  max={order.remainingDue}
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                />
              </label>
              <label>
                Moyen
                <select
                  value={cashHandoverPending ? "ESPECES" : paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  disabled={cashHandoverPending}
                >
                  {Object.entries(paymentMethodLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Référence facultative
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </label>
            <button
              className="primary small"
              disabled={
                busy === "payment" ||
                !paymentAmount ||
                Number(paymentAmount) <= 0
              }
              onClick={() =>
                void run(
                  "payment",
                  () =>
                    api.orders.recordPayment(order.id, {
                      amount: Number(paymentAmount),
                      method: cashHandoverPending ? "ESPECES" : paymentMethod,
                      reference: paymentReference || undefined,
                    }),
                  "Paiement enregistré.",
                )
              }
            >
              {busy === "payment"
                ? "Enregistrement…"
                : "Enregistrer le paiement"}
            </button>
          </div>
        )}

        <div className="order-block">
          <h3>Historique</h3>
          <p className="muted">
            Statut courant :{" "}
            <strong>
              {orderStatusLabel(order.status, order.fulfillmentMode)}
            </strong>
            . Les événements ci-dessous sont conservés dans l’ordre
            chronologique.
          </p>
          <ol className="timeline compact">
            {order.history.map((entry) => (
              <li key={entry.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>
                    {entry.fromStatus
                      ? `${orderStatusLabel(entry.fromStatus, order.fulfillmentMode)} → ${orderStatusLabel(entry.toStatus, order.fulfillmentMode)}`
                      : orderStatusLabel(entry.toStatus, order.fulfillmentMode)}
                  </strong>
                  {entry.comment && <p>{entry.comment}</p>}
                  <small>
                    {formatDate(entry.createdAt)} ·{" "}
                    {entry.actorName || entry.actorType}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {order.payments.length > 0 && (
          <div className="order-block">
            <h3>Paiements</h3>
            <ul className="order-lines">
              {order.payments.map((payment) => (
                <li key={payment.id}>
                  <span>
                    {formatPrice(payment.amount)} ·{" "}
                    {paymentMethodLabels[payment.method] || payment.method}
                    <small>
                      {formatDate(payment.createdAt)} ·{" "}
                      {payment.receivedBy?.name ||
                        (payment.reference?.startsWith("Déclaration client")
                          ? "Déclaration client"
                          : "—")}
                    </small>
                  </span>
                  <strong>{paymentStatusLabels[order.paymentStatus]}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canManage && (
          <div className="order-block action-block">
            <h3>Note interne</h3>
            <p className="muted">
              Les notes internes ne sont jamais exposées au client.
            </p>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={2000}
            />
            <button
              className="secondary small"
              disabled={!note.trim() || busy === "note"}
              onClick={() =>
                void run(
                  "note",
                  () => api.orders.addNote(order.id, note.trim()),
                  "Note ajoutée.",
                ).then(() => setNote(""))
              }
            >
              {busy === "note" ? "Ajout…" : "Ajouter la note"}
            </button>
            {order.notes.length > 0 && (
              <ul className="order-notes">
                {order.notes.map((item) => (
                  <li key={item.id}>
                    <p>{item.body}</p>
                    <small>
                      {item.author?.name || "—"} · {formatDate(item.createdAt)}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {chatOpen && (
        <div className="order-chat-layer" onClick={() => setChatOpen(false)}>
          <section
            className="order-chat"
            onClick={(event) => event.stopPropagation()}
            aria-label="Conversation de la commande"
          >
            <header className="order-chat-head">
              <button
                className="icon-btn"
                onClick={() => setChatOpen(false)}
                aria-label="Fermer la conversation"
              >
                <Icon name="x" />
              </button>
              <span className="order-chat-avatar">
                {initials(order.customerName)}
              </span>
              <div>
                <strong>{order.customerName}</strong>
                <small>
                  {order.customerPhone} · {order.orderNumber}
                </small>
              </div>
            </header>

            {order.conversations.length === 0 ? (
              <div className="order-chat-empty">
                <Icon name="chat" size={26} />
                <p>
                  Aucune conversation n’est encore ouverte pour cette commande.
                </p>
              </div>
            ) : (
              <>
                <div className="order-chat-tabs">
                  {order.conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      className={
                        conversation.id === selectedConversationId
                          ? "active"
                          : ""
                      }
                      onClick={() => setSelectedConversationId(conversation.id)}
                    >
                      <Icon
                        name={
                          conversation.visibility === "CLIENT"
                            ? "user"
                            : "shield"
                        }
                        size={13}
                      />
                      {conversation.visibility === "CLIENT"
                        ? "Client"
                        : "Interne"}
                    </button>
                  ))}
                </div>
                <div className="wa-thread order-chat-thread">
                  <ChatMessageList
                    messages={selectedConversation?.messages ?? []}
                    me="STAFF"
                    emptyLabel="Aucun message. Écrivez au client ou partagez une note vocale."
                  />
                </div>
                {selectedConversation && (
                  <ChatComposer
                    onSend={sendChatMessage}
                    placeholder={
                      selectedConversation.visibility === "CLIENT"
                        ? "Répondre au client…"
                        : "Message interne (invisible du client)…"
                    }
                    onNotice={notify}
                  />
                )}
                {selectedConversation?.visibility === "INTERNAL" && (
                  <p className="order-chat-note">
                    <Icon name="shield" size={12} /> Conversation interne —
                    jamais visible par le client.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
