package com.hisaab.backend;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void fullGroupExpenseBalanceAndSettlementFlow() throws Exception {
        String groupJson = mockMvc.perform(post("/api/groups")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Goa Trip\",\"description\":\"Trip with friends\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.inviteCode").isNotEmpty())
                .andExpect(jsonPath("$.createdAt").isString())
                .andReturn()
                .getResponse()
                .getContentAsString();

        long groupId = objectMapper.readTree(groupJson).get("id").asLong();

        long aliceId = addMember(groupId, "Alice", "alice@example.com");
        addMember(groupId, "Bob", "bob@example.com");
        addMember(groupId, "Charlie", "charlie@example.com");

        mockMvc.perform(post("/api/groups/" + groupId + "/expenses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "description": "Dinner",
                                  "amount": 90.00,
                                  "paidByMemberId": %d,
                                  "splitType": "EQUAL"
                                }
                                """.formatted(aliceId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.shares", hasSize(3)));

        mockMvc.perform(get("/api/groups/" + groupId + "/balances"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].memberName").value("Alice"))
                .andExpect(jsonPath("$[0].netBalance").value(60.0))
                .andExpect(jsonPath("$[1].memberName").value("Bob"))
                .andExpect(jsonPath("$[1].netBalance").value(-30.0))
                .andExpect(jsonPath("$[2].memberName").value("Charlie"))
                .andExpect(jsonPath("$[2].netBalance").value(-30.0));

        mockMvc.perform(get("/api/groups/" + groupId + "/settlements"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].toMemberName").value("Alice"))
                .andExpect(jsonPath("$[0].amount").value(30.0))
                .andExpect(jsonPath("$[1].toMemberName").value("Alice"))
                .andExpect(jsonPath("$[1].amount").value(30.0));
    }

    @Test
    void recordedPaymentProfileAndCurrentUserFlow() throws Exception {
        long groupId = createGroup("Flat 402");

        long aliceId = addMember(groupId, "Alice", "alice@example.com", true);
        long bobId = addMember(groupId, "Bob", "bob@example.com", false);
        long charlieId = addMember(groupId, "Charlie", "charlie@example.com", false);

        mockMvc.perform(get("/api/groups/" + groupId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.members[?(@.id == " + aliceId + ")].currentUser", hasItem(true)));

        mockMvc.perform(post("/api/groups/" + groupId + "/expenses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "description": "Dinner",
                                  "amount": 90.00,
                                  "paidByMemberId": %d,
                                  "splitType": "EQUAL",
                                  "shares": [{"memberId": %d}, {"memberId": %d}, {"memberId": %d}]
                                }
                                """.formatted(aliceId, aliceId, bobId, charlieId)))
                .andExpect(status().isCreated());

        String paymentJson = mockMvc.perform(post("/api/groups/" + groupId + "/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fromMemberId": %d,
                                  "toMemberId": %d,
                                  "amount": 30.00,
                                  "paymentDate": "2026-11-07"
                                }
                                """.formatted(bobId, aliceId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fromMemberName").value("Bob"))
                .andExpect(jsonPath("$.toMemberName").value("Alice"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        long paymentId = objectMapper.readTree(paymentJson).get("id").asLong();

        mockMvc.perform(get("/api/groups/" + groupId + "/balances"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].memberName").value("Alice"))
                .andExpect(jsonPath("$[0].netBalance").value(30.0))
                .andExpect(jsonPath("$[1].memberName").value("Bob"))
                .andExpect(jsonPath("$[1].netBalance").value(0.0))
                .andExpect(jsonPath("$[2].memberName").value("Charlie"))
                .andExpect(jsonPath("$[2].netBalance").value(-30.0));

        mockMvc.perform(get("/api/groups/" + groupId + "/settlements"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].fromMemberName").value("Charlie"))
                .andExpect(jsonPath("$[0].toMemberName").value("Alice"))
                .andExpect(jsonPath("$[0].amount").value(30.0));

        mockMvc.perform(get("/api/groups/" + groupId + "/payments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].amount").value(30.0));

        mockMvc.perform(put("/api/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Alicia\",\"currency\":\"USD\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Alicia"))
                .andExpect(jsonPath("$.currency").value("USD"));

        mockMvc.perform(get("/api/groups/" + groupId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.members[?(@.id == " + aliceId + ")].name", hasItem("Alicia")))
                .andExpect(jsonPath("$.members[?(@.id == " + aliceId + ")].currentUser", hasItem(true)));

        mockMvc.perform(delete("/api/payments/" + paymentId))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/groups/" + groupId + "/balances"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[1].netBalance").value(-30.0));

        mockMvc.perform(delete("/api/groups/" + groupId))
                .andExpect(status().isNoContent());
    }

    @Test
    void expenseCanMoveToAnotherGroup() throws Exception {
        long firstGroupId = createGroup("First group");
        long secondGroupId = createGroup("Second group");

        addMember(firstGroupId, "Alice", "alice@example.com", true);
        addMember(secondGroupId, "Bob", "bob@example.com", true);
        long secondBobId = addMember(secondGroupId, "Charlie", "charlie@example.com", false);

        String expenseJson = mockMvc.perform(post("/api/groups/" + firstGroupId + "/expenses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "description": "Move me",
                                  "amount": 40.00,
                                  "paidByMemberId": %d,
                                  "splitType": "EQUAL"
                                }
                                """.formatted(memberId(firstGroupId, "Alice"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();

        long expenseId = objectMapper.readTree(expenseJson).get("id").asLong();

        mockMvc.perform(put("/api/expenses/" + expenseId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "groupId": %d,
                                  "description": "Move me",
                                  "amount": 40.00,
                                  "paidByMemberId": %d,
                                  "splitType": "EQUAL"
                                }
                                """.formatted(secondGroupId, secondBobId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groupId").value(secondGroupId));

        mockMvc.perform(get("/api/groups/" + firstGroupId + "/expenses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));

        mockMvc.perform(get("/api/groups/" + secondGroupId + "/expenses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));

        mockMvc.perform(delete("/api/groups/" + firstGroupId))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/groups/" + secondGroupId))
                .andExpect(status().isNoContent());
    }

    private long createGroup(String name) throws Exception {
        String groupJson = mockMvc.perform(post("/api/groups")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(groupJson).get("id").asLong();
    }

    private long memberId(long groupId, String name) throws Exception {
        String groupJson = mockMvc.perform(get("/api/groups/" + groupId))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        for (var member : objectMapper.readTree(groupJson).get("members")) {
            if (name.equals(member.get("name").asString())) {
                return member.get("id").asLong();
            }
        }
        throw new IllegalStateException("Member not found: " + name);
    }

    private long addMember(long groupId, String name, String email) throws Exception {
        return addMember(groupId, name, email, false);
    }

    private long addMember(long groupId, String name, String email, boolean currentUser) throws Exception {
        String memberJson = mockMvc.perform(post("/api/groups/" + groupId + "/members")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "%s", "email": "%s", "currentUser": %s}
                                """.formatted(name, email, currentUser)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();

        return objectMapper.readTree(memberJson).get("id").asLong();
    }
}
