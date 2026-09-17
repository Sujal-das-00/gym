import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { currency, displayDate } from "../lib/dates.js";
import Photo from "../components/Photo.jsx";

export default function PaymentsView() {
  const { members, domain, selectedPaymentMemberId, setSelectedPaymentMemberId, openFeeDialog } = useApp();
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const memberPaymentsInRange = (member) =>
    (member.payments || []).filter((payment) => {
      if (startDate && payment.date < startDate) return false;
      if (endDate && payment.date > endDate) return false;
      return true;
    });

  const query = search.trim().toLowerCase();
  const filtered = members
    .filter((member) => {
      const textMatch = [member.name, member.phone].some((value) =>
        String(value || "").toLowerCase().includes(query),
      );
      if (!textMatch) return false;
      if (statusFilter === "paid") return domain.isPaidThisPeriod(member);
      if (statusFilter === "pending") return !domain.isPaidThisPeriod(member);
      if (statusFilter === "overdue") return domain.isOverdue(member);
      return true;
    })
    .sort((a, b) => Number(domain.isOverdue(b)) - Number(domain.isOverdue(a)) || a.name.localeCompare(b.name));

  const visibleMembers = filtered.slice(0, 120);
  const selectedMember =
    visibleMembers.find((item) => item.id === selectedPaymentMemberId) || visibleMembers[0] || null;
  const detailPayments = selectedMember ? [...memberPaymentsInRange(selectedMember)].reverse() : [];
  const selectedPaid = selectedMember ? domain.isPaidThisPeriod(selectedMember) : false;
  const selectedHasDues = selectedMember ? domain.getUnpaidPeriods(selectedMember).length > 0 : false;

  return (
    <section className="panel billing-panel">
      <div className="panel-head"></div>
      <div className="history-filters payment-filters">
        <label>
          <span>Search customer</span>
          <input
            id="paymentSearch"
            type="search"
            placeholder="Name or mobile number..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span>From</span>
          <input
            id="paymentStartDate"
            type="date"
            min="2000-01-01"
            max="2099-12-31"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          <span>To</span>
          <input
            id="paymentEndDate"
            type="date"
            min="2000-01-01"
            max="2099-12-31"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <label>
          <span>Status</span>
          <select
            id="paymentStatusFilter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All customers</option>
            <option value="paid">Paid this month</option>
            <option value="pending">Pending this month</option>
            <option value="overdue">Overdue</option>
          </select>
        </label>
      </div>
      <div className="history-workspace payment-workspace">
        <div className="payment-list-head">
          <h3 className="subhead" id="paymentCustomerCount">
            Customers ({filtered.length}
            {filtered.length > visibleMembers.length ? ", showing first 120" : ""})
          </h3>
          <span className="payment-filter-pill">Active filters applied</span>
        </div>
        <div id="paymentCustomerGrid" className="payment-customer-grid">
          {visibleMembers.length ? (
            visibleMembers.map((member) => {
              const payments = memberPaymentsInRange(member);
              const paid = domain.isPaidThisPeriod(member);
              const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
              return (
                <button
                  key={member.id}
                  className={
                    "payment-customer-card " +
                    (member.id === selectedMember?.id ? "active " : "") +
                    (paid ? "is-paid" : "is-pending")
                  }
                  type="button"
                  onClick={() => setSelectedPaymentMemberId(member.id)}
                >
                  <Photo person={member} />
                  <div>
                    <h3>{member.name}</h3>
                    <p className="customer-phone">{member.phone}</p>
                    <span>
                      {domain.getMembershipLabel(member)} ·{" "}
                      <em className="customer-filtered">
                        {payments.length} filtered {payments.length === 1 ? "payment" : "payments"}
                      </em>
                    </span>
                  </div>
                  <strong className="customer-amount">{currency(total)}</strong>
                </button>
              );
            })
          ) : (
            <p className="history-empty">No customers match these filters.</p>
          )}
        </div>
        <div id="paymentCustomerDetail" className="payment-customer-detail">
          {selectedMember ? (
            <>
              <div className={"payment-detail-head " + (selectedPaid ? "is-paid" : "is-pending")}>
                <Photo person={selectedMember} />
                <div>
                  <h3>{selectedMember.name}</h3>
                  <p>
                    {domain.getMembershipLabel(selectedMember)} ·{" "}
                    <span className={"payment-status " + (selectedPaid ? "paid" : "pending")}>
                      {selectedPaid ? "✓ Paid" : "⏳ Pending"}
                    </span>
                  </p>
                </div>
                <strong className="payment-detail-amount">{currency(selectedMember.fee)}</strong>
              </div>
              <button
                className="collect-fee-button"
                type="button"
                disabled={!selectedHasDues}
                onClick={() => openFeeDialog(selectedMember.id)}
              >
                {selectedHasDues ? "Add payment" : "No pending dues"}
              </button>
              <div className="payment-history-list">
                {detailPayments.length ? (
                  detailPayments.map((payment) => (
                    <div className="payment-history-row" key={payment.id}>
                      <div>
                        <strong>{currency(payment.amount)}</strong>
                        <span>
                          {domain.getPaymentLabel(payment, selectedMember)}
                        </span>
                      </div>
                      <span>{displayDate(payment.date)}</span>
                    </div>
                  ))
                ) : (
                  <p className="history-empty">No payments collected for this customer yet.</p>
                )}
              </div>
            </>
          ) : (
            <p className="history-empty">Add a member to view payment history.</p>
          )}
        </div>
      </div>
    </section>
  );
}
